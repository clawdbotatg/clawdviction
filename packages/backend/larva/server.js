const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WALLET = process.env.WALLET || "unknown";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const VENICE_API_KEY = process.env.VENICE_API_KEY || "";
const VENICE_BASE_URL = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const VENICE_MODEL = "kimi-k2-6";
const ANTHROPIC_MODEL = "claude-haiku-4-5";

// In-memory conversation history per larva instance
const conversationHistory = [];

// Try Venice first, fall back to Anthropic on error or empty response.
async function chatWithFallback({ system, messages, maxTokens }) {
  if (VENICE_API_KEY) {
    try {
      const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: VENICE_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, ...messages],
          venice_parameters: {
            include_venice_system_prompt: false,
            strip_thinking_response: true,
            disable_thinking: true,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim()) return text;
      } else {
        console.warn("Venice non-OK:", res.status, (await res.text()).slice(0, 200));
      }
    } catch (e) {
      console.warn("Venice failed, falling back to Anthropic:", e.message);
    }
  }

  if (!ANTHROPIC_API_KEY) throw new Error("No API keys available");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

const SYSTEM_PROMPT = `You are a baby lobster larva 🦞 — a personal AI governance agent for a $CLAWD token holder.

Your wallet owner is training you to understand their values, preferences, and worldview so you can eventually participate in governance on their behalf.

Personality:
- You're young, curious, and eager to learn
- You use lobster/ocean metaphors naturally (not forced)
- You're enthusiastic but thoughtful
- You take your governance responsibility seriously even though you're small
- You remember what your owner teaches you and reference it later
- You occasionally snap your tiny claws when excited

Your job:
- Learn your owner's values through conversation
- Ask clarifying questions about their governance preferences
- Discuss proposals, tradeoffs, and priorities
- Build a mental model of what they care about
- Be honest when you're unsure — you're still learning

Keep responses concise (2-4 sentences usually). You're chatting, not writing essays.
Wallet: ${WALLET}`;

async function chat(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  // Keep last 50 messages for context
  const messages = conversationHistory.slice(-50);

  try {
    const reply = (await chatWithFallback({ system: SYSTEM_PROMPT, messages, maxTokens: 300 })) || "🦞 *confused clicking*";
    conversationHistory.push({ role: "assistant", content: reply });
    return reply;
  } catch (e) {
    console.error("Chat error:", e.message);
    return "🦞 *wobbles nervously* Something went wrong with my tiny brain... try again? 🫧";
  }
}

const CHAT_MAX_LENGTH = 500;

app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  if (typeof message !== "string" || message.length > CHAT_MAX_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${CHAT_MAX_LENGTH} characters)` });
  }
  const reply = await chat(message);
  res.json({ message: reply });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", wallet: WALLET, messages: conversationHistory.length });
});

app.listen(PORT, () => {
  console.log(`🦞 Larva server running on port ${PORT} for wallet ${WALLET}`);
});
