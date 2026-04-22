/**
 * Structured logger with run-scoped context.
 *
 * Every log line carries a stable `runId` (and optionally `userId`,
 * `opportunityId`, `stage`) so a single incident can be reconstructed by
 * grepping one ID in the Vercel Functions log UI.
 *
 * - Prod (NODE_ENV === "production"): JSON one-line per log call.
 * - Dev: human-readable single line.
 * - Errors: stack + message captured under `error`.
 *
 * Usage:
 *
 *   const log = createLogger({ runId, userId, scope: "cron.pipeline" });
 *   log.info("pipeline starting");
 *   const stageLog = log.child({ stage: "discover" });
 *   stageLog.error("jsearch failed", err, { opportunityId });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  runId?: string;
  userId?: string;
  opportunityId?: string;
  stage?: string;
  scope?: string;
  [key: string]: unknown;
}

export interface Logger {
  readonly context: LogContext;
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(
    message: string,
    error?: unknown,
    extra?: Record<string, unknown>,
  ): void;
  child(extra: LogContext): Logger;
}

export function newRunId(): string {
  // Web Crypto: works in browser, Node 19+, edge, and Vercel Workflow runtime.
  // `node:crypto` would break Workflow bundling for any workflow function that
  // transitively imports this file.
  return globalThis.crypto.randomUUID();
}

export function createLogger(context: LogContext = {}): Logger {
  return makeLogger(context);
}

function makeLogger(context: LogContext): Logger {
  return {
    context,
    debug: (message, extra) =>
      emit("debug", context, message, undefined, extra),
    info: (message, extra) => emit("info", context, message, undefined, extra),
    warn: (message, extra) => emit("warn", context, message, undefined, extra),
    error: (message, error, extra) =>
      emit("error", context, message, error, extra),
    child: (extra) => makeLogger({ ...context, ...extra }),
  };
}

function emit(
  level: LogLevel,
  context: LogContext,
  message: string,
  error: unknown,
  extra: Record<string, unknown> | undefined,
): void {
  const time = new Date().toISOString();
  const errPayload = serializeError(error);
  const merged: Record<string, unknown> = {
    ...context,
    ...(extra ?? {}),
  };

  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify({
      level,
      time,
      msg: message,
      ...merged,
      ...(errPayload ? { error: errPayload } : {}),
    });
    write(level, line);
    return;
  }

  // Dev: pretty single line + stack on its own lines.
  const tag = formatContext(merged);
  const prefix = `[${level.toUpperCase()}]${tag ? ` ${tag}` : ""}`;
  write(level, `${prefix} :: ${message}`);
  if (errPayload?.stack) {
    write(level, errPayload.stack);
  } else if (errPayload?.message) {
    write(level, `  error: ${errPayload.message}`);
  }
}

function write(level: LogLevel, line: string): void {
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function formatContext(ctx: Record<string, unknown>): string {
  const parts: string[] = [];
  if (ctx.runId) parts.push(`run=${shortId(ctx.runId as string)}`);
  if (ctx.scope) parts.push(`${ctx.scope}`);
  if (ctx.stage) parts.push(`stage=${ctx.stage}`);
  if (ctx.userId) parts.push(`user=${shortId(ctx.userId as string)}`);
  if (ctx.opportunityId)
    parts.push(`opp=${shortId(ctx.opportunityId as string)}`);
  for (const [k, v] of Object.entries(ctx)) {
    if (
      k === "runId" ||
      k === "userId" ||
      k === "opportunityId" ||
      k === "stage" ||
      k === "scope"
    )
      continue;
    if (v === undefined || v === null) continue;
    parts.push(`${k}=${formatValue(v)}`);
  }
  return parts.join(" ");
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function shortId(id: string): string {
  if (id.length <= 8) return id;
  return id.slice(0, 8);
}

function serializeError(
  error: unknown,
): { message: string; stack?: string; name?: string } | null {
  if (error == null) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}
