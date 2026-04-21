# GTM Command Center — Template Generalization & ICP/Positioning Build Spec

**Purpose of this document:** Give Claude Code complete context to plan and implement a generalization of the existing onboarding interview flow into a multi-template system, plus two new interview templates.

**How to read this document:**
- Sections 1–3 are product context (what/why/who).
- Sections 4–6 are architecture (how it all fits together).
- Sections 7–9 are template specifications (what to build for each).
- Section 10 is implementation guidance (phases, non-negotiables).
- Appendix contains the reference rubric example.

---

## 1. What's being built

A generalization of the existing `/onboard` flow in GTM Command Center from a **single-purpose job-search interview** into a **multi-template interview platform**.

Today, the app interviews job seekers and outputs a profile + search queries + scoring rubric used to find and rank jobs, then draft outreach.

After this build, the same machinery supports three distinct interview templates:

| Template | Who it interviews | What it produces | Used for |
|---|---|---|---|
| `job_search` (existing) | Job seeker | User profile + job search queries + scoring weights + outreach style | Finding jobs matching the user |
| `icp_definition` (new) | GTM team at an AI-agent company | ICP rubric + company search queries + scoring weights | Finding accounts where the JTBD exists |
| `positioning_rubric` (new) | GTM team at an AI-agent company | Competitive dimensions + win criteria + proof points | Self-evaluation vs competitors; sales enablement |

The state machine, streaming loop, CAS locks, polling pattern, and confirm flow are **preserved unchanged**. Only the interview content (prompts, topics, extraction schema, output mapping) is parameterized per template.

## 2. Why this pivot

Two motivations:

**Product motivation.** The existing architecture is solving a generic problem dressed up as a specific one. The generic problem is: *turn a semi-structured conversation into a machine-readable rubric + search query + scoring function.* Job-matching is one instance. ICP-defining is another. Competitive positioning is a third.

**Market motivation.** GTM teams selling AI agents have a harder version of the same problem job seekers have:
- They need to know *which companies to target* (ICP)
- They need to know *how to win when they get there* (positioning)
- Both are usually done in slide decks — fuzzy, aspirational, unexecutable

This product turns those into **executable rubrics**: the act of defining your ICP produces the search that finds it; the act of defining your positioning produces the rubric that evaluates competitors.

**Architectural motivation.** The existing system was vibe-coded by a non-engineer GTM builder. Generalizing now (before template #2 gets hardcoded) preserves the clean architecture. Waiting means forking code.

## 3. Who this is for

**Primary user:** GTM teams (founders, heads of marketing, GTM engineers) at Series A–C companies selling AI agents into enterprise.

Typical persona characteristics:
- Building an AI agent product for a defined vertical or function (customer support, sales, finance ops, etc.)
- Early-stage positioning — know the product, don't yet have crisp ICP or competitive rubric
- Want to run outbound but lack systematized targeting
- Evaluated against competitors (Decagon, Sierra, Intercom Fin, etc.) in deals and want a defensible scorecard

**Secondary user:** Job seekers — the original use case, preserved as one of three templates.

**User context the app assumes:** The user has enough product knowledge to answer detailed questions about what their agent does, who buys it, and where they win. The interview surfaces and structures this knowledge — it doesn't create it.

## 4. Current architecture (preserve this)

The existing `/onboard` flow is documented in detail in `docs/onboarding-architecture.md`. Summary of what must be preserved:

**State machine:** `in_progress` → `extracting` → `review` → `confirmed` (plus `abandoned`). Atomic compare-and-set on status transitions.

**Two-model split:**
- Sonnet 4.6 runs the conversational interview (streaming, warm, ~1KB per turn)
- Opus 4.6 runs a single extraction pass over the transcript (structured JSON, ~4KB, slow path)

**`report_topics` tool pattern:** A no-op tool the coach calls every turn to declare covered topics in a machine-readable way. This is the completion signal.

**Three completion detectors:** `[INTERVIEW_COMPLETE]` marker, heuristic (5+ topics + no trailing `?`), hard cap at 12 assistant messages.

**Idempotent confirm:** Sequential `upsert` calls to `memory_documents` + `pipeline_config` + `user_scoring_profiles`, followed by a final status flip. Each step retryable.

**Separation of concerns:** Downstream code (scoring, drafting, activation) reads only `memory_documents` + `pipeline_config` + `user_scoring_profiles`. It never reads `onboarding_interviews`. This boundary must be preserved for all new templates.

## 5. The template abstraction

**Core principle:** Generalize the machinery, parameterize the content.

### The `InterviewTemplate` interface

Every template implements:

```typescript
interface InterviewTemplate {
  id: string;                              // "job_search" | "icp_definition" | "positioning_rubric"
  version: string;                         // "v1" — append-only versioning, never break old rows

  topics: readonly string[];               // enum values report_topics accepts
  completionThreshold: number;             // e.g. 5 for job_search, 6 for positioning_rubric
  hardMessageCap: number;                  // default 12, tunable per template

  systemPrompt: string;                    // Sonnet's interview prompt
  openingMessage: string;                  // first coach line
  wrapUpInstruction: string;               // injected at message >= (cap-2)

  extraction: {
    systemPrompt: string;                  // Opus's extraction prompt
    schema: ZodSchema;                     // extractionResultSchema for this template
    maxTokens: number;                     // default 4096
  };

  outputs: OutputMapping[];                // what gets written on confirm
}

interface OutputMapping {
  type: "memory_document" | "pipeline_config" | "scoring_profile" | "custom";
  key: string;                             // e.g. "user_profile", "company_positioning"
  transform: (extracted: unknown) => unknown; // extraction → storage shape
}
```

### File layout

```
src/lib/onboarding/templates/
  ├── index.ts               // getTemplate(id), registerTemplate()
  ├── job-search.ts          // existing logic extracted into template shape
  ├── icp-definition.ts      // new
  └── positioning-rubric.ts  // new
```

Each template is one file. One prompt, one schema, one outputs list. No meta-config language — keep transforms as plain TypeScript functions.

### The five integration points

The generic machinery reads the template at five points. No other code knows about template shape.

1. **`/api/onboard/chat/route.ts`** — system prompt + `report_topics` tool
   ```typescript
   const template = getTemplate(interview.template_id);
   const topicsEnum = z.enum(template.topics);
   const tools = { report_topics: buildReportTopicsTool(topicsEnum) };
   const system = injectWrapUpIfNeeded(template, assistantMessageCount);
   ```

2. **Completion detection** — use `template.completionThreshold` instead of hardcoded `5`.

3. **Extraction (`interview-actions.ts`)** — use template's extraction prompt + schema:
   ```typescript
   const result = await generateObject({
     model: opus,
     system: template.extraction.systemPrompt,
     schema: template.extraction.schema,
     prompt: transcript,
     maxTokens: template.extraction.maxTokens,
   });
   ```

4. **Confirm** — iterate `template.outputs` instead of hardcoded 6-step sequence:
   ```typescript
   for (const output of template.outputs) {
     const data = output.transform(interview.extracted);
     await upsertOutput(output.type, output.key, data, user.id);
   }
   await setStatus(interview.id, "confirmed");
   ```

5. **Router (`/onboard`)** — accept `template_id` via URL param or user context, pass to `getOrCreateInterviewAction(userId, templateId)`.

### Database changes

```sql
ALTER TABLE onboarding_interviews
  ADD COLUMN template_id TEXT NOT NULL DEFAULT 'job_search',
  ADD COLUMN template_version TEXT NOT NULL DEFAULT 'v1';

-- Users can have one active interview per template (not just one globally)
DROP INDEX IF EXISTS onboarding_interviews_user_active_idx;
CREATE UNIQUE INDEX onboarding_interviews_user_template_active_idx
  ON onboarding_interviews (user_id, template_id)
  WHERE status IN ('in_progress', 'extracting', 'review');
```

Existing rows get backfilled with `template_id = 'job_search'`, `template_version = 'v1'`.

### Versioning discipline

`template_version` is append-only. When a prompt or schema changes, bump the version (`v1` → `v2`). Old rows keep their old version and remain readable with old logic. Never mutate existing template versions.

### What NOT to over-abstract

- **Transforms:** Keep each template's `outputs[].transform` as plain procedural TypeScript. It's fine for them to be ugly and specific. Don't build a meta-config DSL.
- **Extraction schemas:** Each template's zod schema lives with the template. Don't try to unify schemas across templates — they're genuinely different shapes.

## 6. Search adapter abstraction

The search adapter is a **sibling abstraction** to the interview template — it turns an extracted output into a set of searches.

Not every template needs one:
- `job_search` → has a search adapter (jobs by keywords + location)
- `icp_definition` → needs a new search adapter (companies by firmographic + technographic + signal layers)
- `positioning_rubric` → needs a competitor research adapter (rubric applied to competitor URLs)

Each adapter is a function: `extractedProfile → Array<SearchQuery>`. Run queries in parallel, union results, dedupe, score against scoring rubric.

The ICP adapter MVP uses **one source: Exa.** LinkedIn company pages serve firmographics; semantic search serves JTBD and hiring signals. Start with three Exa query patterns:

| Layer | Pattern |
|---|---|
| Firmographic | `site:linkedin.com/company [industry] [size range] [stage]` |
| Technographic | `"uses [tool]"` or job posts as proxy |
| Signal (hiring) | `site:linkedin.com/jobs "[role]"` or `site:greenhouse.io "[role]"` |
| Signal (JTBD) | neural: `"companies where [jtbd phrase]"` |
| Trigger events | `"[archetype]" "raised Series B" recency:30d` |

Scoring weights: firmographic < technographic < JTBD/hiring signals. What a company *does right now* predicts intent better than what it *is*.

## 7. Template #1: `job_search` (existing, refactor into shape)

**No behavioral changes.** Just extract the existing hardcoded prompt, tool enum, schema, and 6-step confirm into the template shape.

- **Topics:** `identity`, `career`, `proof_points`, `tools`, `search_prefs`, `dealbreakers`, `outreach_style`
- **Completion threshold:** 5
- **Outputs:** `user_profile`, `user_positioning`, `user_dealbreakers`, `feedback_outreach_style`, `interview_insights`, `pipeline_config`, `user_scoring_profiles` (6 items)

Reference existing files for content:
- `src/lib/onboarding/interview-prompt.ts`
- `src/lib/onboarding/extraction.ts`
- `src/lib/onboarding/extraction-prompt.ts`
- `src/app/(app)/onboard/interview-actions.ts` (confirm logic)

## 8. Template #2: `icp_definition` (new)

**Who it interviews:** GTM lead at an AI-agent company defining which accounts to target.

**Conceptual frame:** "Your ICP is defined by the job-to-be-done your agent replaces. Describe the job, the signals that reveal it, and the companies where it exists."

### Topics

```
- product            // what the agent does, the wedge, the core JTBD it replaces
- buyer             // who signs the contract, who champions, who uses
- firmographics     // industry, size, stage, geography of target accounts
- technographics    // tools/stack that indicate fit (or disqualify)
- signals           // hiring, events, triggers that reveal live pain
- disqualifiers     // hard no's — won't close even if everything else fits
- proof_points      // evidence ICP is real (existing customers, won deals)
```

**Completion threshold:** 5

### Extraction schema

```typescript
{
  product: {
    category: string,               // "AI SDR agent"
    core_jtbd: string,              // "replace manual account research"
    wedge: string,                  // specific entry point
  },
  icp: {
    buyer: {
      economic_buyer: string,       // role/title
      champion: string,
      end_user: string,
    },
    firmographics: {
      industries: string[],
      employee_range: [number, number],
      stages: string[],
      geographies: string[],
    },
    technographics: {
      required_tools: string[],     // must use these
      excluded_tools: string[],     // disqualifiers
    },
    signals: {
      hiring_roles: string[],       // job postings that indicate pain
      jtbd_evidence: string[],      // semantic phrases about the pain
      trigger_events: string[],     // recent events indicating timing
    },
    disqualifiers: string[],        // post-filter exclusions
  },
  scoring: {
    signal_weights: Record<string, number>,  // per-signal weights
    threshold: number,
  },
  proof_points: {
    existing_customers: string[],
    won_deals: string[],
    lost_deals_reasons: string[],
  },
}
```

### Outputs

- `memory_documents[key='company_icp']` — narrative ICP summary for outreach drafting
- `memory_documents[key='icp_proof_points']` — customer evidence for sales enablement
- `pipeline_config` — search queries + threshold + send cap (ICP-specific)
- `user_scoring_profiles` — per-signal weights for lead scoring

### Search adapter contract

The ICP search adapter (Exa-only for MVP) consumes the `icp` object and produces Exa queries per layer. Results populate a new `leads` table:

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  company_name TEXT,
  matched_signals JSONB,           // { firmographic: [...], technographic: [...], signals: [...] }
  score NUMERIC,
  raw_payload JSONB,
  source TEXT,                     // "exa"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);
```

### Extraction discipline

Opus's extraction prompt must enforce one rule: **every signal added to the schema must be one Exa can query.** If the interviewee names a signal Exa can't find (e.g. "companies with internal Slack sentiment about X"), Opus should note it in a `unactionable_signals` field rather than forcing it into `signals`.

## 9. Template #3: `positioning_rubric` (new)

**Who it interviews:** GTM lead or founder defining how their company wins in competitive evaluations.

**Conceptual frame:** "Map the dimensions where you win today and plan to win tomorrow. Every dimension must be backed by a concrete proof point — no aspirational claims."

### Topics

```
- product_truth              // what the product actually does (not marketing)
- current_advantages         // where you win today (product, team, service)
- future_advantages          // where you'll win in 12-24 months
- positioning_choice         // lead with now vs future?
- enterprise_table_stakes    // security, compliance, SLAs, deployment
- competitors                // who you're evaluated against
- proof_points               // evidence for each advantage claim
```

**Completion threshold:** 6 (higher than others — positioning requires more depth)

### Extraction discipline (critical)

This template's Opus prompt has one non-negotiable rule: **a subdimension only makes the rubric if the user named a concrete proof point during the interview.** Vague claims get rejected.

- ✓ "We hit <1hr response SLA, measured across 2024" → include
- ✗ "We have great support" → exclude or request follow-up

Rubrics are only useful if every row is defensible. An undefensible row becomes a liability in competitive evals.

### Extraction schema

```typescript
{
  product: {
    category: string,
    core_jtbd: string,
  },
  competitors: string[],           // named competitors for comparison
  rubric: {
    categories: Array<{
      name: string,                // "Building Agents", "Data Connectors", etc.
      description: string,
      subdimensions: Array<{
        name: string,                         // "No-code visual builder"
        definition: string,                   // highly specific paragraph
        evaluation_criteria: string,          // what an agent looks for
        examples: string,                     // concrete real-world examples
        proof_points: string[],               // evidence the company nails this
        status: "win" | "parity" | "gap",     // self-assessment
        advantage_type: "current" | "future" | "table_stakes",
        positioning_priority: "lead" | "support" | "defend",
        justification: string,                // one-sentence CoT for the status
      }>,
    }>,
  },
  positioning_narrative: {
    lead_with: string[],           // subdimensions to front-load in sales
    differentiation_story: string, // the narrative
    table_stakes_to_prove: string[], // must address but not lead with
  },
}
```

The rubric schema is a **direct mirror of the reference example in the appendix.** Every field in the reference rubric maps to a field here. Use the reference as the gold standard for structure and specificity.

### Outputs

- `memory_documents[key='company_positioning']` — narrative positioning story for outreach
- `positioning_rubrics` (new table) — structured rubric, one row per subdimension, queryable

```sql
CREATE TABLE positioning_rubrics (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  subdimension TEXT NOT NULL,
  definition TEXT,
  evaluation_criteria TEXT,
  examples TEXT,
  proof_points JSONB,
  status TEXT,                     // "win" | "parity" | "gap"
  advantage_type TEXT,
  positioning_priority TEXT,
  justification TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, subdimension)
);
```

### Downstream use

The rubric powers two workflows (future builds, out of scope for this spec but worth knowing):
1. **Competitor research agent** — applies the rubric to competitor URLs and outputs filled scorecards (competitor vs us, per subdimension)
2. **Outreach drafting** — pulls `lead_with` subdimensions into cold email copy

## 10. Implementation guidance

### Phasing

**Phase 1: Template abstraction refactor (no new functionality)**
- Introduce `InterviewTemplate` interface and registry
- Migrate existing job_search logic into `job-search.ts` template file
- Add `template_id` + `template_version` columns to `onboarding_interviews`
- Update route.ts, interview-actions.ts, onboard-router.tsx to read from template
- Verify existing job_search flow works identically end-to-end
- **Do not add new templates in this phase.** Prove the abstraction first.

**Phase 2: ICP template**
- Build `icp-definition.ts` (prompts, schema, outputs, transforms)
- Build ICP search adapter (Exa-only, 3 query layers)
- Create `leads` table
- Route at `/onboard/icp` or `/onboard?template=icp`
- End-to-end test: interview → extraction → review → confirm → search produces leads

**Phase 3: Positioning rubric template**
- Build `positioning-rubric.ts` (prompts with proof-point discipline, schema, outputs)
- Create `positioning_rubrics` table
- Build review UI for rubric (editable table of subdimensions)
- Route at `/onboard/positioning` or `/onboard?template=positioning`

**Phase 4 (out of scope for this spec):** competitor research adapter, rubric-powered outreach drafting.

### Non-negotiables

1. **Do not regress the existing job_search flow.** Every behavior documented in `docs/onboarding-architecture.md` must still work after Phase 1.
2. **Preserve the separation of concerns.** Downstream code reads `memory_documents`, `pipeline_config`, `user_scoring_profiles`, `leads`, `positioning_rubrics` — never `onboarding_interviews`.
3. **Idempotent upserts only.** No mutate-in-place writes in the confirm flow. Every step retryable.
4. **Atomic CAS on status transitions.** Preserve existing pattern in `interview-actions.ts:139`.
5. **Append-only template versioning.** Never break old rows.
6. **Proof-point discipline in `positioning_rubric` extraction.** This is the key quality bar for that template.

### Files likely touched

Read-only reference (do not modify unless explicitly required):
- `docs/onboarding-architecture.md`

Will be modified:
- `src/app/api/onboard/chat/route.ts`
- `src/app/(app)/onboard/interview-actions.ts`
- `src/app/(app)/onboard/_components/onboard-router.tsx`
- `src/app/(app)/onboard/_components/interview-client.tsx`
- `src/app/(app)/onboard/_components/review-client.tsx` (likely needs template-aware rendering)
- `src/lib/onboarding/interview-prompt.ts` (content moves into template files)
- `src/lib/onboarding/extraction.ts`
- `src/lib/onboarding/extraction-prompt.ts`
- `src/lib/pipeline/scoring-profile.ts`
- Database migrations

Will be created:
- `src/lib/onboarding/templates/index.ts`
- `src/lib/onboarding/templates/job-search.ts`
- `src/lib/onboarding/templates/icp-definition.ts`
- `src/lib/onboarding/templates/positioning-rubric.ts`
- ICP search adapter (new module)
- `leads` table migration
- `positioning_rubrics` table migration

---

## Appendix: Reference rubric example

The following is a real-world example of a well-structured positioning rubric for an enterprise customer experience agent platform. The `positioning_rubric` template's extraction schema and Opus prompt should use this as the gold standard for structure, specificity, and the proof-point discipline.

Every subdimension has: name, definition, evaluation criteria, examples, status (binary), justification. Every field is highly specific. Vague claims are absent.

---

### Enterprise Customer Experience Agent Platform Evaluation Rubric

This rubric evaluates enterprise-grade AI agent platforms for customer experience use cases. Each field includes specific evaluation criteria to help AI agents assess competitors accurately.

#### Building Agents

| Subdimension | Definition | Evaluation Criteria | Examples | Status | Justification |
|---|---|---|---|---|---|
| No-code visual builder to build agents | A drag-and-drop interface that allows non-technical users to create and modify AI agent workflows or teams of Agents without writing code. | Look for visual workflow builders, flowchart-style interfaces, or GUI-based agent configuration tools. Must be accessible to business users, not just developers. | Zapier-style workflow builders, Microsoft Power Platform-like interfaces, or visual conversation flow designers. | | |
| Agents Configurable via Developer SDK | Comprehensive software development kits that provide pre-built functions, classes, and utilities for building AI agents programmatically. This would *not* include SDKs for just talking to or using agents or AI functionality, it must be an SDK, typically TypeScript or Python, that fully defines how an agent works and what it does in a declarative way. | Must include documentation, code examples, and framework support (like React, FastAPI, etc.). Look for official SDKs, not just API wrappers. | Official npm packages, PyPI packages, GitHub repositories with framework integrations. | | |
| 2-way sync between code and UI | Changes made in the visual builder automatically update the underlying code, and code changes reflect in the UI interface. | Must demonstrate bidirectional synchronization. Changes in either interface should be reflected in the other without data loss. | Export to code from visual builder, import code changes back to visual interface. | | |

#### Developer Platform

| Subdimension | Definition | Evaluation Criteria | Examples | Status | Justification |
|---|---|---|---|---|---|
| Take actions on any MCP Server, App, or API | Support for Model Context Protocol servers, enabling standardized tool and data source integrations. | Must explicitly support MCP protocol or demonstrate compatibility with MCP servers. Look for MCP-specific documentation or integrations. | MCP server integrations, MCP protocol support documentation, standardized tool interfaces. | | |
| Multi-agent Architecture | Systems that coordinate multiple specialized agents using graph-based workflows or decision trees. | Must support multiple agents working together with defined relationships and handoff logic. Look for visual workflow representations or agent collaboration features. | Agent workflow diagrams, specialist agent routing, multi-agent conversations, task delegation systems. | | |
| Multi-agent Coordination | Support for both delegating tasks to sub-agents while maintaining control, and fully handing off conversations to specialized agents. | Must demonstrate both patterns - delegation (supervisor remains involved) and handoff (full transfer of control). Should show clear examples of each. | Supervisor agents delegating to specialists, seamless handoffs between support tiers, escalation workflows with different control patterns. | | |
| Talk to Agents via A2A, MCP, and Vercel AI SDK formats | Direct communication channels between agents without human intervention, enabling collaborative problem-solving. | Must show agents communicating directly with each other, sharing context, or collaborating on tasks. Should be more than just sequential workflows. | Agents sharing findings, collaborative problem-solving, peer-to-peer agent communication, agent consensus mechanisms. | | |
| Agent Credential and Permissions Management | Individual authentication and authorization systems for each agent, allowing different access levels and API keys. | Must allow different agents to have different credentials, API keys, or access permissions. Should support credential isolation and management. | Agent-specific API key management, individual service account assignments, per-agent permission systems. | | |
| Agent traces in UI + OpenTelemetry | Detailed logging and tracing of agent actions with visual interfaces and industry-standard telemetry. | Must provide visual trace interfaces showing agent decision-making and support OpenTelemetry standards for observability. | Agent decision trees in UI, OpenTelemetry integration, distributed tracing, agent performance monitoring. | | |

#### Data Connectors

| Subdimension | Definition | Evaluation Criteria | Examples | Status | Justification |
|---|---|---|---|---|---|
| Automated ingestion of public sources (docs, help center, etc.) | Systems that automatically discover, crawl, and index publicly available information sources. | Look for web crawling capabilities, RSS feed ingestion, public API integrations, or automated content discovery. Must be ongoing, not one-time imports. | Website crawling, documentation site ingestion, public forum monitoring, news feed integration. | | |
| Automated ingestion of private sources (Notion/Confluence) | Direct integrations that automatically sync content from private knowledge management systems. | Must have native integrations (not just manual uploads) with popular enterprise tools. Should handle permissions and access controls. | Notion API integration, Confluence Cloud connector, SharePoint sync, Google Drive integration. | | |
| Optimized RAG with managed retrieval | Advanced retrieval-augmented generation with intelligent chunking, embedding optimization, and relevance scoring. | Look for advanced RAG features like semantic chunking, hybrid search, relevance tuning, or retrieval optimization. Must be more sophisticated than basic vector search. | Hybrid search (semantic + keyword), relevance tuning interfaces, chunk optimization, retrieval analytics. | | |
| Real-time fetch from any database/API/web | Ability to query live data sources during conversations, not just pre-indexed static content. | Must demonstrate live API calls, database queries, or web scraping during agent interactions. Should handle authentication and rate limiting. | Live inventory lookups, real-time pricing queries, current weather data, live database queries. | | |
| Self-updating knowledge base | Automated systems that refresh and update the agent's knowledge (from internal & external sources like website & docs) without manual intervention. | Look for scheduled updates, webhook-based updates, or real-time syncing with data sources. Must handle changes automatically. | Auto-sync with documentation sites, scheduled database refreshes, webhook integrations for content updates. | | |

#### Interact with your AI agents in…

| Subdimension | Definition | Evaluation Criteria | Examples | Status | Justification |
|---|---|---|---|---|---|
| Claude, ChatGPT, and Cursor | AI agents are callable inside Claude, ChatGPT, and Cursor via each platform's native tool/action interface and can execute at least workflows end-to-end. | Evidence of a *working, documented* integration: official listing/docs **+** runnable setup **+** a successful end-to-end workflow in the target surface (no "theoretical support"). | Claude Tool Use via Anthropic Messages API; ChatGPT Actions/Assistants action (manifest/OAuth); Cursor editor extension or MCP that triggers the agent and completes a workflow. | | |
| Slack and Discord | Native bot integrations that let agents run tasks, respond, and interact within team chats (not just webhooks). | Must include native bot apps with rich, interactive features (slash commands, buttons, threads). One or more workflows must run fully inside Slack/Discord with proper auth and error handling. | Slack bot app with `/command` support, interactive messages, and channel triggers; Discord bot that responds to slash commands, posts updates, and runs workflows in-channel. | | |
| Zendesk, Salesforce, and any Support Platform | Direct integrations with major CRM and customer service platforms for seamless workflow integration. | Must provide native integrations with ticket creation, customer data access, or workflow automation. Should be more than just API connections. | Zendesk ticket integration, Salesforce case management, CRM data synchronization, workflow automation. | | |
| Product Expert Chat Bubble ("Ask AI") | Dedicated conversational AI Agent for customer support that knows everything about the product and company that can search, cite, and handoff questions to other support questions when needed. | Must be able to be based on indexed data in a company's internal and external docs. Must be fully configurable for control and customization. | Inkeep Ask AI support feature. | | |
| Answers with Inline Citations | Responses that include specific references to source documents with clickable links or clear attribution. | Must provide traceable sources for generated content. Look for clickable links, document references, or clear source attribution in responses. | Footnote-style citations, inline source links, "according to [document]" attributions, source confidence scores. | | |
| Guardrails | Safety mechanisms that prevent inappropriate responses and confidence thresholds that trigger human escalation. | Must include content filtering, response confidence scoring, and automatic escalation when confidence is low. Should show safety mechanisms in action. | Content filtering systems, confidence score displays, automatic escalation triggers, safety policy enforcement. | | |
| Enterprise Search (Semantic search, Algolia Replacement) | Advanced search capabilities that understand context and meaning, not just keyword matching. | Must demonstrate semantic search capabilities across enterprise data sources with relevance ranking and context understanding. | Natural language search interfaces, semantic relevance scoring, cross-platform search capabilities, search analytics. | | |

#### Insights & Analytics

| Subdimension | Definition | Evaluation Criteria | Examples | Status | Justification |
|---|---|---|---|---|---|
| Automatic Content Updates (AI Content Writer) | Built-in capabilities for automated generation of documentation or marketing copy, based on product gaps and feature gaps discovered by AI Agents. | Must include AI content generation features specifically designed for creating new content automatically based on feature gaps and knowledge base gaps. | — | | |
| AI Reports on Knowledge Gaps | Analytics that identify what information is missing from the knowledge base. | Must provide insights into unanswered questions, missing information. Should include actionable recommendations. | "Unanswered questions" reports, knowledge gap analytics, feature request tracking, content improvement suggestions. | | |
| AI Reports on Product Feature Gaps | Analytics that identify what information is missing from the knowledge base or what features users are requesting. | Must provide insights into unanswered questions, missing information, or feature requests. Should include actionable recommendations. | "Unanswered questions" reports, knowledge gap analytics, feature request tracking, content improvement suggestions. | | |

#### Building Agent UIs

| Subdimension | Definition | Evaluation Criteria | Examples | Status | Justification |
|---|---|---|---|---|---|
| Out-of-box Chat Components (JavaScript) | Pre-built, customizable JS user interface components that can be embedded in AI Agent chats. | Must provide actual JavaScript components, not just embeddable widgets specifically for AI Agent UI Chats. Should include customization options and documentation. | npm packages with React components, JavaScript libraries, embeddable chat widgets with customization APIs. | | |
| Out-of-box Chat Components (React) | Pre-built, customizable React user interface components that can be embedded in AI Agent chats. | Must provide actual React components, not just embeddable widgets specifically for AI Agent UI Chats. Should include customization options and documentation. | npm packages with React components, JavaScript libraries, embeddable chat widgets with customization APIs. | | |
| Interactive Components within Agent Messages (forms, cards, etc.) | UI elements that allow users to interact beyond simple text chat, including forms, buttons, cards, and other rich interactions. | Must support interactive elements within the chat interface. Look for form handling, button actions, card-based responses, and rich media support. | In-chat forms for data collection, interactive buttons for quick responses, carousel cards, file upload capabilities. | | |
| Custom UIs using Vercel AI SDK format | Compatibility with Vercel's AI SDK formats and streaming protocols for web applications. | Must support Vercel AI SDK formats, streaming responses, or demonstrate integration with Vercel ecosystem. Look for specific SDK compatibility. | Vercel AI SDK integration examples, streaming response support, Next.js compatibility, Vercel deployment guides. | | |

---

**End of build spec.**
