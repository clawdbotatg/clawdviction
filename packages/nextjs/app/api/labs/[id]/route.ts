import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";
const VALID_STATUSES = ["pending", "building", "shipped", "rejected"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await initDb();

    const ideaResult = await sql`
      SELECT id, wallet, title, description, cv_burned::int as cv_burned,
             total_cv::int as total_cv, status, larva_triggered, aggregated_opinion,
             aggregated_opinion_short, created_at
      FROM labs_ideas WHERE id = ${id}`;

    if (ideaResult.rows.length === 0) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const stakesResult = await sql`
      SELECT wallet, cv_amount::int as cv_amount, created_at
      FROM labs_stakes WHERE idea_id = ${id}
      ORDER BY cv_amount DESC`;

    const responseCountResult = await sql`
      SELECT COUNT(*) as cnt FROM labs_responses WHERE idea_id = ${id}`;
    const responseCount = parseInt(responseCountResult.rows[0].cnt);

    const pendingCountResult = await sql`
      SELECT COUNT(*) as cnt FROM labs_queue WHERE idea_id = ${id} AND status IN ('pending', 'processing')`;
    const pendingCount = parseInt(pendingCountResult.rows[0].cnt);

    const larvaResponses = await sql`
      SELECT wallet, response, created_at FROM labs_responses
      WHERE idea_id = ${id} ORDER BY created_at ASC`;

    return NextResponse.json({
      idea: ideaResult.rows[0],
      stakes: stakesResult.rows,
      larvaResponseCount: responseCount,
      larvaPendingCount: pendingCount,
      larvaResponses: larvaResponses.rows,
    });
  } catch (error) {
    console.error("GET /api/labs/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { id } = await params;
    const { status } = await request.json();

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await initDb();

    const result = await sql`
      UPDATE labs_ideas SET status = ${status}
      WHERE id = ${id}
      RETURNING *`;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("PATCH /api/labs/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
