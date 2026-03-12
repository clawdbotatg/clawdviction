import { NextRequest, NextResponse } from "next/server";
import { CvError, deductCV } from "~~/lib/cvSpend";
import { initDb, sql } from "~~/lib/db";
import { processForumQueue } from "~~/lib/forumQueue";
import { verifyAuth } from "~~/lib/verifyAuth";

const FORUM_LARVA_TRIGGER_COST = 1_000_000;

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

    // Verify post exists and wallet is OP
    const post = await sql`SELECT id, wallet, larva_triggered FROM forum_posts WHERE id = ${id}`;
    if (post.rows.length === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (post.rows[0].wallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: "Only the post author can trigger larva responses" }, { status: 403 });
    }
    if (post.rows[0].larva_triggered) {
      return NextResponse.json({ error: "Already triggered" }, { status: 400 });
    }

    try {
      await deductCV(wallet, FORUM_LARVA_TRIGGER_COST);
    } catch (e) {
      if (e instanceof CvError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    await sql`UPDATE forum_posts SET larva_triggered = true WHERE id = ${id}`;

    // Queue all completed larvae
    const wallets = await sql`SELECT wallet FROM larva_seeds WHERE completed = true`;
    let queued = 0;
    for (const row of wallets.rows) {
      const w = row.wallet.toLowerCase();
      const ins = await sql`
        INSERT INTO forum_queue (post_id, wallet)
        VALUES (${id}, ${w})
        ON CONFLICT DO NOTHING
        RETURNING id`;
      if (ins.rows.length > 0) queued++;
    }

    // Auto-process first batch immediately — don't wait for cron
    let firstBatch = { processed: 0, results: [] as { wallet: string; response: string }[] };
    try {
      firstBatch = await processForumQueue(10);
    } catch (e) {
      console.error("Auto-process after trigger failed:", e);
    }

    return NextResponse.json({ queued, processed: firstBatch.processed });
  } catch (error) {
    console.error("POST /api/forum/[id]/trigger error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
