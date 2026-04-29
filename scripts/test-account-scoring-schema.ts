/**
 * Fixture-replay test for `icpAccountAnalysisSchema` (the closed shape that
 * `scoreAccountAgainstIcp` runs every model output through). Validates:
 *
 *   1. Every `success-*.json` fixture parses cleanly. Regression net for
 *      "did we accidentally tighten the schema?"
 *   2. Every `failure-*.json` fails parsing — for the documented reason
 *      (path + Zod issue code) recorded in the matching `.expected.json`.
 *      Regression net for "did we accidentally loosen the schema?"
 *
 * No DB, no Claude, no env — pure Zod replay. CLAUDE.md mandates fixture
 * tests for Zod schemas after any prompt change; this script is the gate.
 *
 * Real captures from `pnpm inspect:ai-errors` should replace the synthetic
 * starter set over time. See fixtures README.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { icpAccountAnalysisSchema } from "../src/lib/pipeline/scoring-account";

const FIXTURE_DIR = join(
  process.cwd(),
  "src/lib/pipeline/__tests__/fixtures/account-scoring",
);

let failures = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
}

interface ExpectedFailure {
  pathPrefix: (string | number)[];
  codes: string[];
}

function pathStartsWith(
  actual: readonly (string | number | symbol)[],
  prefix: readonly (string | number)[],
): boolean {
  if (actual.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (actual[i] !== prefix[i]) return false;
  }
  return true;
}

function listFixtures(suffix: string): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(suffix))
    .sort();
}

console.log("\nFixture replay — icpAccountAnalysisSchema\n");

console.log("Success fixtures:");
const successFiles = listFixtures(".json").filter(
  (n) => n.startsWith("success-") && !n.endsWith(".expected.json"),
);
assert(successFiles.length >= 1, "at least one success fixture exists");
for (const file of successFiles) {
  const data = loadJson(file);
  const result = icpAccountAnalysisSchema.safeParse(data);
  if (!result.success) {
    console.error(
      `    issues for ${file}:`,
      result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  assert(result.success, `${file} parses cleanly`);
}

console.log("\nFailure fixtures:");
const failureFiles = listFixtures(".json").filter(
  (n) => n.startsWith("failure-") && !n.endsWith(".expected.json"),
);
assert(failureFiles.length >= 1, "at least one failure fixture exists");
for (const file of failureFiles) {
  const data = loadJson(file);
  const expected = loadJson(
    file.replace(".json", ".expected.json"),
  ) as ExpectedFailure;
  const result = icpAccountAnalysisSchema.safeParse(data);
  if (result.success) {
    console.error(`    ${file} parsed cleanly but was expected to fail.`);
    failures++;
    continue;
  }
  const matched = result.error.issues.some(
    (issue) =>
      pathStartsWith(issue.path, expected.pathPrefix) &&
      expected.codes.includes(issue.code),
  );
  if (!matched) {
    console.error(
      `    issues for ${file}:`,
      result.error.issues.map((i) => ({
        path: i.path,
        code: i.code,
        message: i.message,
      })),
    );
    console.error(
      `    expected pathPrefix=${JSON.stringify(expected.pathPrefix)} codes=${JSON.stringify(expected.codes)}`,
    );
  }
  assert(
    matched,
    `${file} fails at ${expected.pathPrefix.join(".")} with code in [${expected.codes.join(", ")}]`,
  );
}

console.log("\nSchema-shape sanity:");
// One synthetic check that the schema itself rejects an entirely unrelated shape.
// Catches "did we accidentally widen the top-level type to z.unknown?"
const randomShape: z.infer<typeof icpAccountAnalysisSchema> | { foo: string } =
  { foo: "bar" } as { foo: string };
const random = icpAccountAnalysisSchema.safeParse(randomShape);
assert(!random.success, "random shape rejected");

console.log(`\n${failures === 0 ? "OK" : `FAILED: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
