import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { aggregateForumPost } from "~~/lib/forumAggregate";
import { processForumQueue } from "~~/lib/forumQueue";
import { errMsg, logLarvaError } from "~~/lib/larvaErrors";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDb();

    // Reset any abandoned processing items from timed-out cron runs.
    // Safe because crons fire every 2 min with max 120s duration, so any
    // item still in 'processing' at the start of the next run is dead.
    await sql`UPDATE forum_queue SET status = 'pending' WHERE status = 'processing'`;

    const { processed } = await processForumQueue(10);

    // Auto-aggregate: find posts with all responses done but no aggregated opinion
    const needsAggregation = await sql`
      SELECT fp.id
      FROM forum_posts fp
      WHERE fp.larva_triggered = true
        AND fp.aggregated_opinion IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM forum_queue fq
          WHERE fq.post_id = fp.id AND fq.status IN ('pending', 'processing')
        )
        AND EXISTS (
          SELECT 1 FROM forum_responses fr WHERE fr.post_id = fp.id
        )`;

    const aggregated: number[] = [];
    for (const row of needsAggregation.rows) {
      try {
        await aggregateForumPost(row.id);
        aggregated.push(row.id);
        console.log(`Auto-aggregated forum post ${row.id}`);
      } catch (e) {
        console.error(`Auto-aggregate failed for forum post ${row.id}:`, e);
        await logLarvaError({
          surface: "forum-agg",
          errorType: "model_error",
          message: errMsg(e),
          context: { postId: row.id, cron: true },
        });
      }
    }

    return NextResponse.json({ processed, aggregated });
  } catch (error) {
    console.error("Cron forum-process error:", error);
    await logLarvaError({
      surface: "forum-queue",
      errorType: "internal",
      statusCode: 500,
      message: errMsg(error),
      context: { cron: true },
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
