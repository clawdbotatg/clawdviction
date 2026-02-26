import { NextRequest, NextResponse } from "next/server";
import { compressMemory, initDb, isDbAvailable, sql } from "~~/lib/db";

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
    const { wallet, message, messages: clientMessages, identityBrief } = await request.json();

    if (!wallet || !message) {
      return NextResponse.json({ error: "Missing wallet or message" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    await initDb();
    const dbOk = await isDbAvailable();

    let history: { role: string; content: string }[];
    let briefFromDb: string | null = null;

    if (dbOk) {
      // Check for DB-stored identity brief (takes priority)
      try {
        const briefResult = await sql`
          SELECT identity_brief FROM larva_seeds WHERE wallet = ${wallet} AND completed = true`;
        if (briefResult.rows.length > 0 && briefResult.rows[0].identity_brief) {
          briefFromDb = briefResult.rows[0].identity_brief;
        }
      } catch { /* ignore */ }

      // Save user message to DB
      await sql`
        INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'user', ${message})`;

      // Check for memory snapshot
      const snapshotResult = await sql`SELECT snapshot FROM memory_snapshots WHERE wallet = ${wallet}`;
      const snapshot = snapshotResult.rows[0]?.snapshot;

      // Load messages from DB
      const dbMessages = await sql`
        SELECT role, content FROM chat_messages
        WHERE wallet = ${wallet}
        ORDER BY created_at DESC
        LIMIT 30`;

      const rawMessages = dbMessages.rows.reverse() as { role: string; content: string }[];

      if (snapshot && rawMessages.length > 20) {
        // Snapshot + last 20 pattern
        const last20 = rawMessages.slice(-20);
        history = [
          { role: "user", content: `[Memory summary from previous conversations]: ${snapshot}` },
          { role: "assistant", content: "I remember our previous conversations. Let's continue! 🦞" },
          ...last20,
        ];
      } else {
        history = rawMessages;
      }
    } else {
      // Fallback: use client-passed messages
      history = Array.isArray(clientMessages) && clientMessages.length > 0
        ? clientMessages
        : [{ role: "user", content: message }];
    }

    const effectiveBrief = briefFromDb || identityBrief || null;

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
        system: LARVA_SYSTEM_PROMPT(wallet) + (effectiveBrief ? `\n\n${effectiveBrief}` : ""),
        messages: history,
      }),
    });

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || "🦞 *confused clicking*";

    if (dbOk) {
      // Save assistant reply
      await sql`
        INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'assistant', ${assistantMessage})`;

      // Fire-and-forget memory compression check
      const countResult = await sql`SELECT COUNT(*) as cnt FROM chat_messages WHERE wallet = ${wallet}`;
      const count = parseInt(countResult.rows[0].cnt);
      if (count >= 40 && count % 20 === 0) {
        compressMemory(wallet).catch(() => {});
      }
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
