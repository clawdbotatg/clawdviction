import { NextRequest, NextResponse } from "next/server";
import { CvError, deductCV } from "~~/lib/cvSpend";
import { initDb, sql } from "~~/lib/db";
import { getPostCosts } from "~~/lib/postCost";
import { verifyAuth } from "~~/lib/verifyAuth";

export async function GET() {
  try {
    await initDb();
    const result = await sql`
      SELECT p.id, p.wallet, p.title, p.body, p.cv_burned::int as cv_burned,
             p.total_cv::int as total_cv,
             p.larva_triggered, p.aggregated_opinion_short, p.created_at,
             COALESCE(p.archived, false) as archived, p.archived_by,
             COUNT(DISTINCT r.id)::int as reply_count,
             COUNT(DISTINCT s.id)::int as stake_count,
             p.total_cv / pow(extract(epoch from (NOW() - p.created_at))/3600 + 2, 0.7) as score
      FROM forum_posts p
      LEFT JOIN forum_replies r ON r.post_id = p.id
      LEFT JOIN forum_stakes s ON s.post_id = p.id
      GROUP BY p.id
      ORDER BY COALESCE(p.archived, false) ASC, score DESC`;
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("GET /api/forum error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, body } = await request.json();
    if (!title || !body) {
      return NextResponse.json({ error: "Title and body required" }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: "Title too long (max 200)" }, { status: 400 });
    }
    if (body.length > 2000) {
      return NextResponse.json({ error: "Body too long (max 2000)" }, { status: 400 });
    }

    await initDb();

    const { forum: cost } = await getPostCosts();

    try {
      await deductCV(wallet, cost);
    } catch (e) {
      if (e instanceof CvError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const result = await sql`
      INSERT INTO forum_posts (wallet, title, body, cv_burned, total_cv)
      VALUES (${wallet}, ${title}, ${body}, ${cost}, ${cost})
      RETURNING *`;

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/forum error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
