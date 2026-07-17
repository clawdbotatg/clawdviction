import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

// Room judgment: SHIP IT vs SLOP. One vote per wallet on the chosen idea,
// signature-checked; re-voting switches sides.
export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vote } = await request.json();
    if (vote !== "ship" && vote !== "slop") {
      return NextResponse.json({ error: "Vote must be 'ship' or 'slop'" }, { status: 400 });
    }

    await initDb();

    const showResult = await sql`SELECT phase, chosen_idea_id FROM live_show WHERE id = 1`;
    const phase = showResult.rows[0]?.phase;
    const chosenIdeaId = showResult.rows[0]?.chosen_idea_id;
    if (phase !== "judgment" || !chosenIdeaId) {
      return NextResponse.json({ error: "Voting is not open" }, { status: 400 });
    }

    await sql`
      INSERT INTO live_votes (idea_id, wallet, vote)
      VALUES (${chosenIdeaId}, ${wallet}, ${vote})
      ON CONFLICT (idea_id, wallet) DO UPDATE SET vote = ${vote}, created_at = NOW()`;

    const tallyResult = await sql`
      SELECT vote, COUNT(*)::int as count FROM live_votes
      WHERE idea_id = ${chosenIdeaId} GROUP BY vote`;
    const votes = { ship: 0, slop: 0 };
    for (const row of tallyResult.rows) {
      if (row.vote === "ship") votes.ship = row.count;
      if (row.vote === "slop") votes.slop = row.count;
    }

    return NextResponse.json({ success: true, yourVote: vote, votes });
  } catch (error) {
    console.error("POST /api/live/vote error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
