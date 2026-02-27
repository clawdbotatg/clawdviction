import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const verified = await verifyAuth(request);
  if (!verified || verified !== wallet.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ⚠️ wallet is stored mixed-case (checksummed) in DB — never use lower() when querying or deleting

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
    const { wallet } = await params;
    const verified = await verifyAuth(request);
    if (!verified || verified !== wallet.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { answers } = await request.json();

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
