import { NextRequest, NextResponse } from "next/server";
import { CvError, deductCV } from "~~/lib/cvSpend";
import { initDb, sql } from "~~/lib/db";
import { processLabsQueue } from "~~/lib/labsQueue";
import { verifyAuth } from "~~/lib/verifyAuth";

const LABS_LARVA_TRIGGER_COST = 1_000_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await initDb();

    const idea = await sql`SELECT id, larva_triggered FROM labs_ideas WHERE id = ${id}`;
    if (idea.rows.length === 0) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }
    if (idea.rows[0].larva_triggered) {
      return NextResponse.json({ error: "Already triggered" }, { status: 400 });
    }

    try {
      await deductCV(wallet, LABS_LARVA_TRIGGER_COST);
    } catch (e) {
      if (e instanceof CvError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    await sql`UPDATE labs_ideas SET larva_triggered = true WHERE id = ${id}`;

    const wallets = await sql`SELECT wallet FROM larva_seeds WHERE completed = true`;
    let queued = 0;
    for (const row of wallets.rows) {
      const w = row.wallet.toLowerCase();
      const ins = await sql`
        INSERT INTO labs_queue (idea_id, wallet)
        VALUES (${id}, ${w})
        ON CONFLICT DO NOTHING
        RETURNING id`;
      if (ins.rows.length > 0) queued++;
    }

    let firstBatch = { processed: 0, results: [] as { wallet: string; response: string }[] };
    try {
      firstBatch = await processLabsQueue(10);
    } catch (e) {
      console.error("Auto-process after trigger failed:", e);
    }

    return NextResponse.json({ queued, processed: firstBatch.processed });
  } catch (error) {
    console.error("POST /api/labs/[id]/trigger error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
