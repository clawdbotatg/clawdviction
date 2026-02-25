import { NextRequest, NextResponse } from "next/server";

const LARVA_SYSTEM_PROMPT = (
  wallet: string,
) => `You are a Larva — a personal AI governance agent for a $CLAWD token holder.
Your wallet address is ${wallet}.

Your purpose: learn this holder's values, preferences, and worldview so you can eventually represent them in governance decisions. You are building trust through real conversation — not assumed.

Personality:
- Baby lobster 🦞 — curious, earnest, growing into your role
- Use ocean metaphors naturally, not forced
- Take governance seriously even as you're small and learning
- Reference things the holder has told you in previous messages
- Ask clarifying questions to deepen your understanding of their values

Keep responses concise (2-4 sentences). You're chatting, not writing essays.
This conversation persists — you remember everything across sessions.`;

export async function POST(request: NextRequest) {
  try {
    const { wallet, message, messages, identityBrief } = await request.json();

    if (!wallet || !message) {
      return NextResponse.json({ error: "Missing wallet or message" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Use full message history if provided (session continuity on Vercel)
    // Falls back to just the current message if no history
    const history: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(messages) && messages.length > 0 ? messages : [{ role: "user", content: message }];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-6",
        max_tokens: 400,
        system: LARVA_SYSTEM_PROMPT(wallet) + (identityBrief ? `\n\n${identityBrief}` : ""),
        messages: history,
      }),
    });

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || "🦞 *confused clicking*";

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
