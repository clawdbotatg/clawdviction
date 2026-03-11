import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await initDb();

    const postResult = await sql`
      SELECT id, wallet, title, body, cv_burned::int as cv_burned,
             larva_triggered, aggregated_opinion, aggregated_opinion_short, created_at
      FROM forum_posts WHERE id = ${id}`;
    if (postResult.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const replies = await sql`
      SELECT id, wallet, body, cv_burned::int as cv_burned, created_at
      FROM forum_replies WHERE post_id = ${id}
      ORDER BY created_at ASC`;

    const larvaCount = await sql`
      SELECT COUNT(*)::int as count FROM forum_responses WHERE post_id = ${id}`;

    const pendingCount = await sql`
      SELECT COUNT(*)::int as count FROM forum_queue WHERE post_id = ${id} AND status = 'pending'`;

    return NextResponse.json({
      post: postResult.rows[0],
      replies: replies.rows,
      larvaResponseCount: larvaCount.rows[0].count,
      larvaPendingCount: pendingCount.rows[0].count,
    });
  } catch (error) {
    console.error("GET /api/forum/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
