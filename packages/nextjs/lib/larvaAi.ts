// Larva model wrapper.
// Primary: Venice (kimi-k2-6, OpenAI-compatible /chat/completions).
// Fallback: Anthropic Haiku (content-block tool use).
// Both paths share a single tool surface defined by LarvaTool.

const VENICE_BASE = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const VENICE_MODEL = "kimi-k2-6";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

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
  provider: "venice" | "anthropic";
};

export async function runLarvaConversation(opts: LarvaRunOptions): Promise<LarvaRunResult> {
  if (process.env.VENICE_API_KEY) {
    try {
      const text = await runVenice(opts);
      if (text && text.trim()) {
        console.log("[larvaAi] provider=venice");
        return { text, provider: "venice" };
      }
      console.warn("[larvaAi] Venice returned empty content — falling back to Anthropic");
    } catch (e) {
      console.warn("[larvaAi] Venice failed — falling back to Anthropic:", e instanceof Error ? e.message : e);
    }
  }

  const text = await runAnthropic(opts);
  console.log("[larvaAi] provider=anthropic");
  return { text, provider: "anthropic" };
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
  const maxTokens = opts.maxTokens ?? 2000;
  const maxToolResult = opts.maxToolResultLength ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 25000;

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

/* ---------- Anthropic (content blocks) ---------- */

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type AnthropicToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;
type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicBlock[] };

async function runAnthropic(opts: LarvaRunOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const maxRounds = opts.maxToolRounds ?? 3;
  const maxTokens = opts.maxTokens ?? 2000;
  const maxToolResult = opts.maxToolResultLength ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 25000;

  const tools = opts.tools?.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
  const toolMap = new Map(opts.tools?.map(t => [t.name, t]) ?? []);

  const messages: AnthropicMessage[] = opts.messages.map(m => ({ role: m.role, content: m.content }));

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        ...(opts.system ? { system: opts.system } : {}),
        messages,
        ...(tools ? { tools } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const stop: string | undefined = data.stop_reason;
    const content: AnthropicBlock[] | undefined = data.content;

    if (stop === "tool_use" && content) {
      messages.push({ role: "assistant", content });
      const toolResults: AnthropicToolResultBlock[] = [];
      for (const block of content) {
        if (block.type !== "tool_use") continue;
        const tool = toolMap.get(block.name);
        let result: string;
        if (!tool) {
          result = JSON.stringify({ error: `unknown tool ${block.name}` });
        } else {
          result = await tool.execute(block.input || {});
        }
        if (result.length > maxToolResult) result = result.slice(0, maxToolResult) + "… [truncated]";
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    return content?.find((b): b is AnthropicTextBlock => b.type === "text")?.text ?? "";
  }
  return "";
}
