import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { QueueItem, processQueueItem } from "~~/lib/processQueueItem";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

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

    for (const item of pending.rows as QueueItem[]) {
      try {
        const result = await processQueueItem(item, apiKey);
        results.push(result);
      } catch (e) {
        console.error(`Queue processing error for item ${item.id}:`, e);
        await sql`UPDATE governance_queue SET status = 'failed' WHERE id = ${item.id}`;
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("POST /api/gov/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
