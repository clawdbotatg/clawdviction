import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = parseInt(params.id);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { wallet, response, reasoning } = await request.json();
    if (!wallet || !response) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await initDb();

    await sql`
      INSERT INTO governance_responses (proposal_id, wallet, response, reasoning)
      VALUES (${id}, ${wallet}, ${response}, ${reasoning || null})
      ON CONFLICT (proposal_id, wallet) DO UPDATE SET
        response = ${response}, reasoning = ${reasoning || null}`;

    await sql`
      UPDATE governance_queue SET status = 'done', processed_at = NOW()
      WHERE proposal_id = ${id} AND wallet = ${wallet}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/gov/[id]/respond error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
