import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { wallet, message } = await request.json();

    if (!wallet || !message) {
      return NextResponse.json({ error: "Missing wallet or message" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const systemPrompt = `You are a Larva — a personal AI governance agent for a $CLAWD token holder. Your wallet address is ${wallet}.

Your purpose is to learn about your holder's values, preferences, and worldview so you can eventually represent them in governance decisions.

Be warm, curious, and genuine. Ask thoughtful questions to understand what matters to them. You're not just a chatbot — you're building a relationship of trust so they can eventually delegate governance decisions to you.

You are a baby lobster 🦀 growing into your role. Be playful but substantive.

Keep responses concise but meaningful. If you learn something important about the holder's values or preferences, mention it naturally.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || "Something went wrong 🦀";

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
