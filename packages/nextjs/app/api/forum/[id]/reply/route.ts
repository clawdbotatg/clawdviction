import { NextRequest, NextResponse } from "next/server";
import { CvError, deductCV } from "~~/lib/cvSpend";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const FORUM_REPLY_COST = 200_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { body } = await request.json();
    if (!body || body.length > 2000) {
      return NextResponse.json({ error: "Body required (max 2000 chars)" }, { status: 400 });
    }

    await initDb();

    // Verify post exists
    const post = await sql`SELECT id FROM forum_posts WHERE id = ${id}`;
    if (post.rows.length === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    try {
      await deductCV(wallet, FORUM_REPLY_COST);
    } catch (e) {
      if (e instanceof CvError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const result = await sql`
      INSERT INTO forum_replies (post_id, wallet, body, cv_burned)
      VALUES (${id}, ${wallet}, ${body}, ${FORUM_REPLY_COST})
      RETURNING *`;

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/forum/[id]/reply error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
