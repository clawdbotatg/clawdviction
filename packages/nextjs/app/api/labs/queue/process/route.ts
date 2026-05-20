import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { aggregateLabsIdea } from "~~/lib/labsAggregate";
import { processLabsQueue } from "~~/lib/labsQueue";

export const maxDuration = 120;

async function handleProcess(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await initDb();

    // Reset any abandoned processing items from timed-out cron runs.
    // Safe because crons fire every 2 min with max 60s duration, so any
    // item still in 'processing' at the start of the next run is dead.
    await sql`UPDATE labs_queue SET status = 'pending' WHERE status = 'processing'`;

    const { processed, results } = await processLabsQueue(10);

    // Auto-aggregate: find ideas with all responses done but no aggregated opinion
    const needsAggregation = await sql`
      SELECT li.id
      FROM labs_ideas li
      WHERE li.aggregated_opinion IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM labs_queue lq
          WHERE lq.idea_id = li.id AND lq.status IN ('pending', 'processing')
        )
        AND EXISTS (
          SELECT 1 FROM labs_responses lr WHERE lr.idea_id = li.id
        )`;

    const aggregated: number[] = [];
    for (const row of needsAggregation.rows) {
      try {
        await aggregateLabsIdea(row.id);
        aggregated.push(row.id);
        console.log(`Auto-aggregated labs idea ${row.id}`);
      } catch (e) {
        console.error(`Auto-aggregate failed for labs idea ${row.id}:`, e);
      }
    }

    return NextResponse.json({ processed, results, aggregated });
  } catch (error) {
    console.error("/api/labs/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleProcess(request);
}

export async function POST(request: NextRequest) {
  return handleProcess(request);
}
