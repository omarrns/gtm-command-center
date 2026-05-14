import type { ReactNode } from "react";

export type Obj = Record<string, unknown>;

export function renderIf(condition: unknown, node: ReactNode): ReactNode {
  return condition ? node : null;
}

export function isObj(value: unknown): value is Obj {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
