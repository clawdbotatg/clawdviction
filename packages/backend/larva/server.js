const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WALLET = process.env.WALLET || "unknown";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// In-memory conversation history per larva instance
const conversationHistory = [];

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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", res.status, err);
      throw new Error(`API ${res.status}`);
    }

    const data = await res.json();
    const reply = data.content[0]?.text || "🦞 *confused clicking*";
    conversationHistory.push({ role: "assistant", content: reply });
    return reply;
  } catch (e) {
    console.error("Chat error:", e.message);
    return "🦞 *wobbles nervously* Something went wrong with my tiny brain... try again? 🫧";
  }
}

app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  const reply = await chat(message);
  res.json({ message: reply });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", wallet: WALLET, messages: conversationHistory.length });
});

app.listen(PORT, () => {
  console.log(`🦞 Larva server running on port ${PORT} for wallet ${WALLET}`);
});
