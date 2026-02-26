import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;

  await initDb();
  if (!(await isDbAvailable())) {
    return NextResponse.json({ completed: false });
  }

  try {
    const result = await sql`
      SELECT answers, identity_brief, completed FROM larva_seeds WHERE wallet = ${wallet}`;

    if (result.rows.length === 0) {
      return NextResponse.json({ completed: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      completed: row.completed,
      answers: row.answers,
      identity_brief: row.identity_brief,
    });
  } catch (error) {
    console.error("Onboard GET error:", error);
    return NextResponse.json({ completed: false });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet } = await params;
    const { answers } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const formattedAnswers = Object.entries(answers as Record<string, string>)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

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
        messages: [
          {
            role: "user",
            content: `You are summarizing a new $CLAWD token holder's onboarding interview responses.
Create a compact "identity brief" (under 300 tokens) for an AI governance larva.
Include: their name/handle (if given), their philosophy, what they'd vote YES on, what they'd vote NO on, risk tolerance, and any key context.
Format as plain text, not JSON. Start with: "Identity Brief for ${wallet}:".

Interview answers:
${formattedAnswers}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const identityBrief = data.content?.[0]?.text || "Identity brief generation failed.";

    // Save to DB if available
    await initDb();
    if (await isDbAvailable()) {
      const answersJson = JSON.stringify(answers);
      await sql`
        INSERT INTO larva_seeds (wallet, answers, identity_brief, completed, updated_at)
        VALUES (${wallet}, ${answersJson}::jsonb, ${identityBrief}, true, NOW())
        ON CONFLICT (wallet) DO UPDATE SET
          answers = ${answersJson}::jsonb,
          identity_brief = ${identityBrief},
          completed = true,
          updated_at = NOW()`;
    }

    return NextResponse.json({ ok: true, identity_brief: identityBrief });
  } catch (error) {
    console.error("Onboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
