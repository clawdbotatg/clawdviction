import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { errMsg, logLarvaError } from "~~/lib/larvaErrors";
import { QueueItem, processQueueItem } from "~~/lib/processQueueItem";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await initDb();

    const pending = await sql`
      SELECT q.id, q.proposal_id, q.wallet, p.type, p.title, p.question, p.options
      FROM governance_queue q
      JOIN governance_proposals p ON p.id = q.proposal_id
      WHERE q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT 10`;

    if (pending.rows.length === 0) {
      return NextResponse.json({ processed: 0, results: [] });
    }

    const results: { wallet: string; response: string }[] = [];

    const settled = await Promise.allSettled((pending.rows as QueueItem[]).map(item => processQueueItem(item)));

    for (let i = 0; i < settled.length; i++) {
      const item = pending.rows[i] as QueueItem;
      const result = settled[i];
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error(`Queue processing error for item ${item.id}:`, result.reason);
        await logLarvaError({
          surface: "gov-queue",
          errorType: "model_error",
          wallet: item.wallet,
          message: errMsg(result.reason),
          context: { queueItemId: item.id, proposalId: item.proposal_id, type: item.type },
        });
        await sql`UPDATE governance_queue SET status = 'failed' WHERE id = ${item.id}`;
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("POST /api/gov/queue/process error:", error);
    await logLarvaError({ surface: "gov-queue", errorType: "internal", statusCode: 500, message: errMsg(error) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
