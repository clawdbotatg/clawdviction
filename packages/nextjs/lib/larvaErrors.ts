import { isDbAvailable, sql } from "~~/lib/db";

// Every surface that can produce a larva failure. New surfaces should be added
// here so the admin filter list stays exhaustive.
export type LarvaErrorSurface =
  | "chat"
  | "greet"
  | "forum-queue"
  | "labs-queue"
  | "gov-queue"
  | "forum-agg"
  | "labs-agg"
  | "gov-agg"
  | "memory-compress";

export type LarvaErrorType =
  | "auth" // 401 — missing/invalid signature
  | "forbidden" // 403 — wrong wallet for admin route
  | "bad_request" // 400 — missing fields, length cap
  | "rate_limit" // 429 — per-wallet sliding window
  | "insufficient_cv" // 402 — atomic CV deduction returned 0 rows
  | "config" // 500 — no API key
  | "model_error" // model call threw (timeout, HTTP, parse)
  | "model_empty" // model returned no content
  | "provider_failed" // one provider failed but fallback succeeded — informational
  | "internal" // unexpected error in catch-all
  | "not_found"
  | "db_error";

export async function logLarvaError(params: {
  surface: LarvaErrorSurface;
  errorType: LarvaErrorType;
  wallet?: string | null;
  statusCode?: number;
  message?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!(await isDbAvailable())) return;
    const wallet = params.wallet ? params.wallet.toLowerCase() : null;
    const message = params.message ? params.message.slice(0, 2000) : null;
    const context = params.context ? JSON.stringify(params.context).slice(0, 4000) : null;
    await sql`
      INSERT INTO larva_errors (surface, error_type, wallet, status_code, message, context)
      VALUES (${params.surface}, ${params.errorType}, ${wallet}, ${params.statusCode ?? null}, ${message}, ${context}::jsonb)`;
  } catch (e) {
    console.error("logLarvaError failed:", e instanceof Error ? e.message : e);
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
