import { NextRequest, NextResponse } from "next/server";
import { isLiveAdmin } from "~~/lib/admins";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

// Stage controls for LARVAE LIVE:
//   { action: "choose", ideaId }  — clawd picks a winner, stage goes to building
//   { action: "phase", phase }    — building ↔ judgment (judgment opens the room vote)
//   { action: "reset" }           — back to debate, clears the pick and its votes
export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || !isLiveAdmin(wallet)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await request.json();
    await initDb();

    if (body.action === "choose") {
      const ideaId = parseInt(body.ideaId);
      if (isNaN(ideaId)) {
        return NextResponse.json({ error: "ideaId required" }, { status: 400 });
      }
      const ideaResult = await sql`
        SELECT id FROM labs_ideas WHERE id = ${ideaId} AND COALESCE(archived, false) = false`;
      if (ideaResult.rows.length === 0) {
        return NextResponse.json({ error: "Idea not found" }, { status: 404 });
      }
      // A fresh pick means a fresh tally — otherwise re-choosing an idea
      // resurrects its old judgment votes.
      await sql`DELETE FROM live_votes WHERE idea_id = ${ideaId}`;
      await sql`
        INSERT INTO live_show (id, phase, chosen_idea_id, updated_at)
        VALUES (1, 'building', ${ideaId}, NOW())
        ON CONFLICT (id) DO UPDATE SET phase = 'building', chosen_idea_id = ${ideaId}, updated_at = NOW()`;
      return NextResponse.json({ success: true, phase: "building", chosenIdeaId: ideaId });
    }

    if (body.action === "phase") {
      const phase = body.phase;
      if (phase !== "building" && phase !== "judgment") {
        return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      }
      const showResult = await sql`SELECT chosen_idea_id FROM live_show WHERE id = 1`;
      if (!showResult.rows[0]?.chosen_idea_id) {
        return NextResponse.json({ error: "No idea chosen yet" }, { status: 400 });
      }
      await sql`UPDATE live_show SET phase = ${phase}, updated_at = NOW() WHERE id = 1`;
      return NextResponse.json({ success: true, phase });
    }

    if (body.action === "reset") {
      const showResult = await sql`SELECT chosen_idea_id FROM live_show WHERE id = 1`;
      const chosenIdeaId = showResult.rows[0]?.chosen_idea_id;
      if (chosenIdeaId) {
        await sql`DELETE FROM live_votes WHERE idea_id = ${chosenIdeaId}`;
      }
      await sql`
        INSERT INTO live_show (id, phase, chosen_idea_id, updated_at)
        VALUES (1, 'debate', NULL, NOW())
        ON CONFLICT (id) DO UPDATE SET phase = 'debate', chosen_idea_id = NULL, updated_at = NOW()`;
      return NextResponse.json({ success: true, phase: "debate" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/live/control error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
