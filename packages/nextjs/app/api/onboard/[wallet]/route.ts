import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";
import { MAX_LENGTH_MAIN, MAX_LENGTH_NOTES } from "~~/lib/questions";
import { verifyAuth } from "~~/lib/verifyAuth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet: rawWallet } = await params;
  const wallet = rawWallet.toLowerCase();
  const verified = await verifyAuth(request);
  if (!verified || verified !== wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  if (!(await isDbAvailable())) {
    return NextResponse.json({ completed: false });
  }

  try {
    const result = await sql`
      SELECT answers, completed FROM larva_seeds WHERE wallet = ${wallet}`;

    if (result.rows.length === 0) {
      return NextResponse.json({ completed: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      completed: row.completed,
      answers: row.answers,
    });
  } catch (error) {
    console.error("Onboard GET error:", error);
    return NextResponse.json({ completed: false });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: rawWallet } = await params;
    const wallet = rawWallet.toLowerCase();
    const verified = await verifyAuth(request);
    if (!verified || verified !== wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { answers } = await request.json();

    // Validate answer lengths — notes fields (keys ending in _notes) are capped at MAX_LENGTH_NOTES,
    // all other fields at MAX_LENGTH_MAIN. Matches client-side maxLength props in OnboardingInterview.
    if (answers && typeof answers === "object") {
      for (const [key, val] of Object.entries(answers)) {
        if (typeof val !== "string") continue;
        const limit = key.endsWith("_notes") ? MAX_LENGTH_NOTES : MAX_LENGTH_MAIN;
        if (val.length > limit) {
          return NextResponse.json(
            { error: `Answer too long (max ${limit} characters for "${key}")` },
            { status: 400 },
          );
        }
      }
    }

    // Save raw answers directly — no summarization. The larva gets the full Q&A.
    await initDb();
    if (await isDbAvailable()) {
      const answersJson = JSON.stringify(answers);
      await sql`
        INSERT INTO larva_seeds (wallet, answers, identity_brief, completed, updated_at)
        VALUES (${wallet}, ${answersJson}::jsonb, NULL, true, NOW())
        ON CONFLICT (wallet) DO UPDATE SET
          answers = ${answersJson}::jsonb,
          identity_brief = NULL,
          completed = true,
          updated_at = NOW()`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Onboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
