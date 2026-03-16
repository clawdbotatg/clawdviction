import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { QueueItem, processQueueItem } from "~~/lib/processQueueItem";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
      return NextResponse.json({ processed: 0 });
    }

    const results: { wallet: string; response: string }[] = [];

    const settled = await Promise.allSettled((pending.rows as QueueItem[]).map(item => processQueueItem(item, apiKey)));

    for (let i = 0; i < settled.length; i++) {
      const item = pending.rows[i] as QueueItem;
      const result = settled[i];
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error(`Queue processing error for item ${item.id}:`, result.reason);
        await sql`UPDATE governance_queue SET status = 'failed' WHERE id = ${item.id}`;
      }
    }

    return NextResponse.json({ processed: results.length });
  } catch (error) {
    console.error("Cron gov-process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
