import { JOB_SEARCH_TEMPLATE } from "./job-search";
import type {
  ClientInterviewTemplate,
  InterviewTemplate,
  InterviewTemplateId,
} from "./types";

// Partial registry — new templates land incrementally. `getTemplate` throws
// on unknown ids, so callers get a clear error if they reference a template
// that isn't registered yet. icp_definition is registered in Phase 3.
const REGISTRY: Partial<Record<InterviewTemplateId, InterviewTemplate>> = {
  job_search: JOB_SEARCH_TEMPLATE as InterviewTemplate,
};

export function getTemplate(id: string): InterviewTemplate {
  const template = REGISTRY[id as InterviewTemplateId];
  if (!template) {
    throw new Error(`Unknown interview template: ${id}`);
  }
  return template;
}

export function getDefaultTemplate(): InterviewTemplate {
  return JOB_SEARCH_TEMPLATE as InterviewTemplate;
}

// Strip non-serializable fields so client components can receive the template
// as a prop across the RSC boundary. Functions, zod schemas, and tool
// definitions cannot cross — only the plain data client UIs actually render.
export function toClientTemplate(
  template: InterviewTemplate,
): ClientInterviewTemplate {
  return {
    id: template.id,
    topics: template.topics,
    topicLabels: template.topicLabels,
    openingMessage: template.openingMessage,
    refreshOpeningMessage: template.refreshOpeningMessage,
    agenticMode: template.agenticMode,
    dimensions: template.agenticMode
      ? template.dimensions.map((d) => ({ key: d.key, label: d.label }))
      : [],
  };
}

export type {
  ClientInterviewTemplate,
  InterviewTemplate,
  InterviewTemplateId,
} from "./types";
