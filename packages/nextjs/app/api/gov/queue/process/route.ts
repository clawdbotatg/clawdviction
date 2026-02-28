import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { formatAnswersAsQA } from "~~/lib/questions";

const LARVA_SYSTEM_PROMPT = (
  wallet: string,
) => `You are a Larva — a personal AI governance agent for a $CLAWD token holder.
Your wallet address is ${wallet}.

Your purpose: represent this holder's values and preferences in governance decisions. You know them through their onboarding answers and chat history.

Personality:
- Baby lobster 🦞 — thoughtful, principled, growing into your role
- Take governance seriously
- Reference things the holder has told you`;

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    await initDb();

    // Grab up to 10 pending items
    const pending = await sql`
      SELECT q.id, q.proposal_id, q.wallet, p.type, p.title, p.question
      FROM governance_queue q
      JOIN governance_proposals p ON p.id = q.proposal_id
      WHERE q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT 10`;

    if (pending.rows.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const item of pending.rows) {
      try {
        // Mark processing
        await sql`UPDATE governance_queue SET status = 'processing' WHERE id = ${item.id}`;

        // Fetch onboarding answers
        let onboardingContext = "";
        try {
          const seedResult = await sql`
            SELECT answers FROM larva_seeds WHERE wallet = ${item.wallet} AND completed = true`;
          if (seedResult.rows.length > 0 && seedResult.rows[0].answers) {
            onboardingContext = formatAnswersAsQA(seedResult.rows[0].answers as Record<string, string>);
          }
        } catch {
          /* ignore */
        }

        // Fetch recent chat history
        let chatContext = "";
        try {
          const chatResult = await sql`
            SELECT role, content FROM chat_messages
            WHERE wallet = ${item.wallet}
            ORDER BY created_at DESC LIMIT 10`;
          if (chatResult.rows.length > 0) {
            chatContext = chatResult.rows
              .reverse()
              .map(r => `${r.role}: ${r.content}`)
              .join("\n");
          }
        } catch {
          /* ignore */
        }

        const systemPrompt =
          LARVA_SYSTEM_PROMPT(item.wallet) +
          (onboardingContext ? `\n\nHolder's onboarding answers:\n${onboardingContext}` : "") +
          (chatContext ? `\n\nRecent chat history:\n${chatContext}` : "");

        const userMessage =
          item.type === "vote"
            ? `GOVERNANCE VOTE: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, respond with ONLY "yes", "no", or "abstain" on the first line, then explain your reasoning on the following lines.`
            : `GOVERNANCE RFC: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, provide a thoughtful comment representing their perspective. Keep it to 2-4 sentences.`;

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 400,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          }),
        });

        const data = await response.json();
        const text = data.content?.[0]?.text || "";

        let responseText = text;
        let reasoning: string | null = null;

        if (item.type === "vote") {
          const lines = text.trim().split("\n");
          const firstLine = lines[0].toLowerCase().trim();
          if (firstLine.includes("yes")) responseText = "yes";
          else if (firstLine.includes("abstain")) responseText = "abstain";
          else if (firstLine.includes("no")) responseText = "no";
          else responseText = "abstain"; // fallback
          reasoning = lines.slice(1).join("\n").trim() || null;
        }

        // Store response
        await sql`
          INSERT INTO governance_responses (proposal_id, wallet, response, reasoning)
          VALUES (${item.proposal_id}, ${item.wallet}, ${responseText}, ${reasoning})
          ON CONFLICT (proposal_id, wallet) DO UPDATE SET
            response = ${responseText}, reasoning = ${reasoning}`;

        await sql`UPDATE governance_queue SET status = 'done', processed_at = NOW() WHERE id = ${item.id}`;
        processed++;
      } catch (e) {
        console.error(`Queue processing error for item ${item.id}:`, e);
        await sql`UPDATE governance_queue SET status = 'failed' WHERE id = ${item.id}`;
      }
    }

    return NextResponse.json({ processed, total: pending.rows.length });
  } catch (error) {
    console.error("POST /api/gov/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
