/**
 * Executable guardrail for AGENTS.md / CLAUDE.md technical rules.
 *
 * Fails on:
 *   - owned files exceeding 400 lines (or their grandfathered baseline count)
 *   - imports of `@/lib/pipeline/runner` outside of runner.ts and the regression test
 *   - any import of `@ai-sdk/anthropic` (must route through Vercel AI Gateway)
 *   - imports of `lucide-react` outside vendored AI Elements
 *
 * Owned scope: `src/**` and `scripts/**`, excluding vendored `src/components/ai-elements/**`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const OWNED_ROOTS = ["src", "scripts"];
const VENDORED_PREFIXES = ["src/components/ai-elements"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const MAX_LINES = 400;

const FORBIDDEN_IMPORTS: Array<{
  pattern: RegExp;
  message: string;
  exempt: (rel: string) => boolean;
}> = [
  {
    pattern:
      /from\s+["']@ai-sdk\/anthropic["']|require\(["']@ai-sdk\/anthropic["']\)/,
    message:
      "imports @ai-sdk/anthropic — route through Vercel AI Gateway via gateway(modelId)",
    exempt: () => false,
  },
  {
    pattern:
      /from\s+["']@\/lib\/pipeline\/runner["']|from\s+["']\.\.\/src\/lib\/pipeline\/runner["']|from\s+["']\.\.?\/runner["']/,
    message:
      "imports the legacy pipeline/runner — use workflow.ts or pipeline/types.ts",
    exempt: (rel) =>
      rel === "src/lib/pipeline/runner.ts" ||
      rel === "scripts/test-pipeline-regression.ts",
  },
  {
    pattern:
      /from\s+["']lucide-react["']|require\(["']lucide-react["']\)/,
    message:
      "imports lucide-react — use @phosphor-icons/react for app-owned UI",
    exempt: () => false,
  },
];

interface BaselineFile {
  files: Record<string, number>;
}

function loadBaseline(): Record<string, number> {
  const path = join(ROOT, "scripts", "agent-check.baseline.json");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as BaselineFile;
    return parsed.files ?? {};
  } catch {
    return {};
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (VENDORED_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (CODE_EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

function main(): void {
  const baseline = loadBaseline();
  const files = OWNED_ROOTS.flatMap((root) => walk(join(ROOT, root)));
  const violations: string[] = [];
  let scanned = 0;

  for (const full of files) {
    const rel = relative(ROOT, full).split("\\").join("/");
    const text = readFileSync(full, "utf8");
    const lineCount = text.split("\n").length;
    scanned++;

    const grandfathered = baseline[rel];
    const limit = grandfathered ?? MAX_LINES;
    if (lineCount > limit) {
      const tag = grandfathered
        ? `grandfathered limit ${grandfathered}`
        : `limit ${MAX_LINES}`;
      violations.push(`✘ ${rel}: ${lineCount} lines (${tag})`);
    }

    for (const rule of FORBIDDEN_IMPORTS) {
      if (rule.exempt(rel)) continue;
      if (rule.pattern.test(text)) {
        violations.push(`✘ ${rel}: ${rule.message}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(
      `\n${violations.length} agent-check violation(s) across ${scanned} owned files.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ agent-check clean (${scanned} owned files scanned, ${Object.keys(baseline).length} grandfathered).`,
  );
}

main();
