// Larva model wrapper — Venice kimi-k2-6 (OpenAI-compatible /chat/completions),
// tool-use loop included. Anthropic was removed 2026-05-20; all larva inference
// flows through Venice now.

const VENICE_BASE = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const VENICE_MODEL = "kimi-k2-6";

export type LarvaTool = {
  name: string;
  description: string;
  // JSON Schema for the tool's arguments object.
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
  execute: (args: Record<string, unknown>) => Promise<string>;
};

export type LarvaMessage = { role: "user" | "assistant"; content: string };

export type LarvaRunOptions = {
  /** Optional system prompt. Omitted when empty. */
  system?: string;
  messages: LarvaMessage[];
  tools?: LarvaTool[];
  maxTokens?: number;
  maxToolRounds?: number;
  maxToolResultLength?: number;
  timeoutMs?: number;
};

export type LarvaRunResult = {
  text: string;
  provider: "venice";
};

export async function runLarvaConversation(opts: LarvaRunOptions): Promise<LarvaRunResult> {
  // Warn-level so the line surfaces in Vercel's indexed runtime logs.
  console.warn("[larvaAi] runLarvaConversation called", {
    veniceKey: !!process.env.VENICE_API_KEY,
    hasTools: !!opts.tools?.length,
  });

  if (!process.env.VENICE_API_KEY) {
    throw new Error("VENICE_API_KEY not set");
  }

  const text = await runVenice(opts);
  console.warn("[larvaAi] provider=venice");
  return { text, provider: "venice" };
}

/* ---------- Venice (OpenAI-compatible) ---------- */

type OpenAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

async function runVenice(opts: LarvaRunOptions): Promise<string> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new Error("VENICE_API_KEY not set");

  const maxRounds = opts.maxToolRounds ?? 3;
  // kimi-k2-6 ignores venice_parameters.disable_thinking and burns 1200-2400+ tokens
  // on hidden reasoning before emitting content (Venice bug as of 2026-05-20). At 2500
  // we still saw ~33% empty-with-finish_reason:"length". Floor at 4000 to leave room
  // for the visible reply after thinking finishes.
  const maxTokens = Math.max(opts.maxTokens ?? 2000, 4000);
  const maxToolResult = opts.maxToolResultLength ?? 3000;
  // Real prompts (long memory + 30 msg chat context) push kimi-k2-6 to 60-100s per call.
  // 60s default was still timing out in production after the 4000-token bump.
  const timeoutMs = opts.timeoutMs ?? 120000;

  const tools = opts.tools?.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const toolMap = new Map(opts.tools?.map(t => [t.name, t]) ?? []);

  const messages: OpenAIMessage[] = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages.map(m => ({ role: m.role, content: m.content }) as OpenAIMessage),
  ];

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: VENICE_MODEL,
        max_tokens: maxTokens,
        messages,
        ...(tools ? { tools } : {}),
        venice_parameters: {
          include_venice_system_prompt: false,
          strip_thinking_response: true,
          // Without this, kimi-k2-6 spends the entire max_tokens budget on internal reasoning
          // and returns empty content with finish_reason: "length".
          disable_thinking: true,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Venice HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("Venice: no choices in response");

    const msg = choice.message ?? {};
    const finish: string | undefined = choice.finish_reason;
    const toolCalls: OpenAIToolCall[] | undefined = msg.tool_calls;

    if (Array.isArray(toolCalls) && toolCalls.length > 0 && finish === "tool_calls") {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
      for (const call of toolCalls) {
        const tool = toolMap.get(call.function.name);
        let result: string;
        if (!tool) {
          result = JSON.stringify({ error: `unknown tool ${call.function.name}` });
        } else {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(call.function.arguments || "{}");
          } catch {
            /* ignore */
          }
          result = await tool.execute(parsed);
        }
        if (result.length > maxToolResult) result = result.slice(0, maxToolResult) + "… [truncated]";
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue;
    }

    return typeof msg.content === "string" ? msg.content : "";
  }
  return "";
}
