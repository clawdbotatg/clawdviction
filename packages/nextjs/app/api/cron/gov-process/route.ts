import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { aggregateGovProposal } from "~~/lib/govAggregate";
import { QueueItem, processQueueItem } from "~~/lib/processQueueItem";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDb();

    // Reset items stuck in 'processing' for more than 10 minutes (crashed mid-flight)
    await sql`
      UPDATE governance_queue
      SET status = 'pending'
      WHERE status = 'processing'
        AND created_at < NOW() - INTERVAL '10 minutes'`;

    const pending = await sql`
      SELECT q.id, q.proposal_id, q.wallet, p.type, p.title, p.question, p.options
      FROM governance_queue q
      JOIN governance_proposals p ON p.id = q.proposal_id
      WHERE q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT 10`;

    const results: { wallet: string; response: string }[] = [];

    if (pending.rows.length > 0) {
      const settled = await Promise.allSettled((pending.rows as QueueItem[]).map(item => processQueueItem(item)));

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
    }

    // Auto-aggregate: find proposals with all responses done but no aggregated opinion
    const needsAggregation = await sql`
      SELECT p.id
      FROM governance_proposals p
      WHERE p.aggregated_opinion IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM governance_queue q
          WHERE q.proposal_id = p.id AND q.status IN ('pending', 'processing')
        )
        AND EXISTS (
          SELECT 1 FROM governance_responses r WHERE r.proposal_id = p.id
        )`;

    const aggregated: number[] = [];
    for (const row of needsAggregation.rows) {
      try {
        await aggregateGovProposal(row.id);
        aggregated.push(row.id);
        console.log(`Auto-aggregated gov proposal ${row.id}`);
      } catch (e) {
        console.error(`Auto-aggregate failed for proposal ${row.id}:`, e);
      }
    }

    return NextResponse.json({ processed: results.length, aggregated });
  } catch (error) {
    console.error("Cron gov-process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
