// Larva model wrapper — BANKR-proxied Anthropic (claude-sonnet-4.6).
// Switched from Venice kimi-k2-6 on 2026-05-20 after Venice's broken
// disable_thinking flag caused widespread empty responses + timeouts on
// forum-queue. BANKR proxies Anthropic Messages API at llm.bankr.bot
// with X-API-Key auth.

const BANKR_BASE = process.env.BANKR_BASE_URL || "https://llm.bankr.bot";
const BANKR_MODEL = process.env.BANKR_MODEL || "claude-sonnet-4.6";

export type LarvaTool = {
  name: string;
  description: string;
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
  provider: "bankr";
};

export async function runLarvaConversation(opts: LarvaRunOptions): Promise<LarvaRunResult> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error("BANKR_API_KEY not set");
  }
  const text = await runBankr(opts);
  return { text, provider: "bankr" };
}

/* ---------- BANKR / Anthropic Messages API ---------- */

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
type AnthropicAssistantContent = AnthropicTextBlock | AnthropicToolUseBlock;
type AnthropicMessage =
  | { role: "user"; content: string | AnthropicToolResultBlock[] }
  | { role: "assistant"; content: AnthropicAssistantContent[] };

async function runBankr(opts: LarvaRunOptions): Promise<string> {
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) throw new Error("BANKR_API_KEY not set");

  const maxRounds = opts.maxToolRounds ?? 3;
  const maxTokens = opts.maxTokens ?? 1024;
  const maxToolResult = opts.maxToolResultLength ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 60000;

  const tools = opts.tools?.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
  const toolMap = new Map(opts.tools?.map(t => [t.name, t]) ?? []);

  const messages: AnthropicMessage[] = opts.messages.map(m => ({
    role: m.role,
    content: m.role === "assistant" ? [{ type: "text", text: m.content }] : m.content,
  })) as AnthropicMessage[];

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${BANKR_BASE}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        model: BANKR_MODEL,
        max_tokens: maxTokens,
        ...(opts.system ? { system: opts.system } : {}),
        messages,
        ...(tools ? { tools } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`BANKR HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const content: AnthropicAssistantContent[] = Array.isArray(data.content) ? data.content : [];
    const stopReason: string | undefined = data.stop_reason;

    if (stopReason === "tool_use") {
      messages.push({ role: "assistant", content });
      const toolResults: AnthropicToolResultBlock[] = [];
      for (const block of content) {
        if (block.type !== "tool_use") continue;
        const tool = toolMap.get(block.name);
        let result: string;
        let isError = false;
        if (!tool) {
          result = JSON.stringify({ error: `unknown tool ${block.name}` });
          isError = true;
        } else {
          try {
            result = await tool.execute(block.input ?? {});
          } catch (e) {
            result = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
            isError = true;
          }
        }
        if (result.length > maxToolResult) result = result.slice(0, maxToolResult) + "… [truncated]";
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result, is_error: isError });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    return content
      .filter((b): b is AnthropicTextBlock => b.type === "text")
      .map(b => b.text)
      .join("");
  }
  return "";
}
