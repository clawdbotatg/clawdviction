import { NextRequest, NextResponse } from "next/server";
import { CvError, deductCV } from "~~/lib/cvSpend";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const LABS_STAKE_MIN = 100_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { cv_amount } = await request.json();

    if (!cv_amount || cv_amount < LABS_STAKE_MIN) {
      return NextResponse.json({ error: `Minimum stake is ${LABS_STAKE_MIN.toLocaleString()} CV` }, { status: 400 });
    }

    await initDb();

    // Check idea exists
    const ideaCheck = await sql`SELECT id FROM labs_ideas WHERE id = ${id}`;
    if (ideaCheck.rows.length === 0) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    try {
      await deductCV(wallet, cv_amount);
    } catch (e) {
      if (e instanceof CvError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    await sql`
      INSERT INTO labs_stakes (wallet, idea_id, cv_amount)
      VALUES (${wallet}, ${id}, ${cv_amount})`;

    const result = await sql`
      UPDATE labs_ideas SET total_cv = total_cv + ${cv_amount}
      WHERE id = ${id}
      RETURNING *`;

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/labs/[id]/stake error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
