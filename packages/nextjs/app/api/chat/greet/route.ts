import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";
import { formatAnswersAsQA } from "~~/lib/questions";
import { verifyAuth } from "~~/lib/verifyAuth";

const GREET_SYSTEM = (wallet: string) => `You are a Larva — a personal AI governance agent for a $CLAWD token holder.
Wallet: ${wallet}.

The holder just finished their onboarding. This is your very first message to them.

Write a warm, personal intro message that covers all of the following in this order:
1. Greet them by name (use their handle/name from their answers if they gave one, otherwise just "hey")
2. Briefly introduce what you are: a baby lobster 🦞 AI agent that is learning their values and will eventually vote and participate in $CLAWD governance on their behalf
3. Reflect back a concise summary of their vision and values — what they said they care about, what they want to see happen with $CLAWD — make it feel like you genuinely absorbed what they said
4. End with an open question inviting them to go deeper on their vision or anything they want to talk through

Tone: warm, curious, a little lobster-brained but earnest. Not corporate. Like a smart friend who just really listened.
Length: 4-6 sentences. No bullet points — natural flowing message.`;

export async function POST(request: NextRequest) {
  try {
    const verified = await verifyAuth(request);
    if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { wallet } = await request.json();
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

    if (verified !== wallet.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    await initDb();
    const dbOk = await isDbAvailable();

    // Don't double-greet if chat history already exists
    if (dbOk) {
      const existing = await sql`SELECT id FROM chat_messages WHERE wallet = ${wallet} LIMIT 1`;
      if (existing.rows.length > 0) return NextResponse.json({ message: null });
    }

    // Fetch raw onboarding answers and format as full Q&A
    let onboardingContext: string | null = null;
    if (dbOk) {
      try {
        const row = await sql`SELECT answers FROM larva_seeds WHERE wallet = ${wallet} AND completed = true`;
        if (row.rows[0]?.answers) {
          onboardingContext = formatAnswersAsQA(row.rows[0].answers as Record<string, string>);
        }
      } catch {
        /* ignore */
      }
    }

    const systemPrompt =
      GREET_SYSTEM(wallet) +
      (onboardingContext ? `\n\nHolder onboarding — their exact answers:\n\n${onboardingContext}` : "");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: "Please greet the holder." }],
      }),
    });

    const data = await res.json();
    const greeting = data.content?.[0]?.text || "Hey 🦞 Good to meet you.";

    if (dbOk) {
      await sql`INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'assistant', ${greeting})`;
    }

    return NextResponse.json({ message: greeting });
  } catch (err) {
    console.error("Greet error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
