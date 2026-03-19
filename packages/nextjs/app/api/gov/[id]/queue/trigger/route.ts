import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { QueueItem, processQueueItem } from "~~/lib/processQueueItem";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await initDb();

    const body = await request.json().catch(() => ({}));
    const refetch = body?.refetch === true;

    if (refetch) {
      // Re-queue all wallets that already responded so we can regenerate their response
      await sql`
        UPDATE governance_queue SET status = 'pending', processed_at = NULL
        WHERE proposal_id = ${id} AND status IN ('done', 'failed')`;

      // Also add any onboarded wallets that are NOT yet in the queue at all
      await sql`
        INSERT INTO governance_queue (proposal_id, wallet, status)
        SELECT ${id}, ls.wallet, 'pending'
        FROM larva_seeds ls
        WHERE ls.completed = true
          AND NOT EXISTS (
            SELECT 1 FROM governance_queue gq
            WHERE gq.proposal_id = ${id} AND LOWER(gq.wallet) = LOWER(ls.wallet)
          )
        ON CONFLICT DO NOTHING`;
    }

    const pending = await sql`
      SELECT q.id, q.proposal_id, q.wallet, p.type, p.title, p.question, p.options
      FROM governance_queue q
      JOIN governance_proposals p ON p.id = q.proposal_id
      WHERE q.proposal_id = ${id} AND q.status = 'pending'
      ORDER BY q.created_at ASC`;

    if (pending.rows.length === 0) {
      return NextResponse.json({ processed: 0, results: [] });
    }

    const results: { wallet: string; response: string }[] = [];

    for (const item of pending.rows as QueueItem[]) {
      try {
        const result = await processQueueItem(item);
        results.push(result);
      } catch (e) {
        console.error(`Queue trigger error for item ${item.id}:`, e);
        await sql`UPDATE governance_queue SET status = 'failed' WHERE id = ${item.id}`;
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("POST /api/gov/[id]/queue/trigger error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
