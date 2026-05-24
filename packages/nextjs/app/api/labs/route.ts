import { NextRequest, NextResponse } from "next/server";
import { CvError, deductCV } from "~~/lib/cvSpend";
import { initDb, sql } from "~~/lib/db";
import { getPostCosts } from "~~/lib/postCost";
import { verifyAuth } from "~~/lib/verifyAuth";

export async function GET() {
  try {
    await initDb();
    const result = await sql`
      SELECT i.id, i.wallet, i.title, i.description, i.cv_burned::int as cv_burned,
             i.total_cv::int as total_cv, i.status, i.created_at,
             COALESCE(i.archived, false) as archived, i.archived_by,
             COUNT(s.id)::int as stake_count,
             i.total_cv / pow(extract(epoch from (NOW() - i.created_at))/3600 + 2, 0.7) as score
      FROM labs_ideas i
      LEFT JOIN labs_stakes s ON s.idea_id = i.id
      GROUP BY i.id
      ORDER BY COALESCE(i.archived, false) ASC, score DESC`;
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("GET /api/labs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, description } = await request.json();
    if (!title || !description) {
      return NextResponse.json({ error: "Title and description required" }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: "Title too long (max 200)" }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: "Description too long (max 2000)" }, { status: 400 });
    }

    await initDb();

    const { labs: cost } = await getPostCosts();

    try {
      await deductCV(wallet, cost);
    } catch (e) {
      if (e instanceof CvError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const result = await sql`
      INSERT INTO labs_ideas (wallet, title, description, cv_burned, total_cv)
      VALUES (${wallet}, ${title}, ${description}, ${cost}, ${cost})
      RETURNING *`;

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/labs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
