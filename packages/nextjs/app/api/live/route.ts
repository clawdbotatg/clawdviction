import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";

// Arguments per candidate shown in the debate ticker. Favor high-CV larvae;
// skip near-empty responses so the floor speeches stay punchy.
const ARGUMENTS_PER_IDEA = 12;
const MIN_ARGUMENT_LENGTH = 40;

export async function GET(request: NextRequest) {
  try {
    await initDb();

    const showResult = await sql`SELECT phase, chosen_idea_id FROM live_show WHERE id = 1`;
    const phase: string = showResult.rows[0]?.phase ?? "debate";
    const chosenIdeaId: number | null = showResult.rows[0]?.chosen_idea_id ?? null;

    const topResult = await sql`
      SELECT id, wallet, title, description, total_cv::float8 as total_cv, status, created_at,
             aggregated_opinion_short
      FROM labs_ideas
      WHERE COALESCE(archived, false) = false
      ORDER BY total_cv DESC, created_at ASC
      LIMIT 3`;

    let candidates = topResult.rows;

    // Once clawd has chosen, the winner stays on stage even if it slips out of the top 3
    if (chosenIdeaId && !candidates.some(c => c.id === chosenIdeaId)) {
      const chosenResult = await sql`
        SELECT id, wallet, title, description, total_cv::float8 as total_cv, status, created_at,
               aggregated_opinion_short
        FROM labs_ideas WHERE id = ${chosenIdeaId}`;
      if (chosenResult.rows.length > 0) {
        candidates = [chosenResult.rows[0], ...candidates].slice(0, 3);
      }
    }

    const argumentsByIdea: Record<number, { wallet: string; response: string; larva_cv: number }[]> = {};
    for (const candidate of candidates) {
      const argsResult = await sql`
        SELECT lr.wallet, lr.response, COALESCE(cb.balance, 0)::float8 as larva_cv
        FROM labs_responses lr
        LEFT JOIN clawdviction_balances cb ON LOWER(lr.wallet) = LOWER(cb.wallet)
        WHERE lr.idea_id = ${candidate.id} AND length(lr.response) >= ${MIN_ARGUMENT_LENGTH}
        ORDER BY COALESCE(cb.balance, 0) DESC, lr.created_at ASC
        LIMIT ${ARGUMENTS_PER_IDEA}`;
      argumentsByIdea[candidate.id] = argsResult.rows as { wallet: string; response: string; larva_cv: number }[];
    }

    const votes = { ship: 0, slop: 0 };
    let yourVote: string | null = null;
    if (chosenIdeaId) {
      const tallyResult = await sql`
        SELECT vote, COUNT(*)::int as count FROM live_votes
        WHERE idea_id = ${chosenIdeaId} GROUP BY vote`;
      for (const row of tallyResult.rows) {
        if (row.vote === "ship") votes.ship = row.count;
        if (row.vote === "slop") votes.slop = row.count;
      }

      const wallet = request.nextUrl.searchParams.get("wallet");
      if (wallet) {
        const yourResult = await sql`
          SELECT vote FROM live_votes
          WHERE idea_id = ${chosenIdeaId} AND wallet = ${wallet.toLowerCase()}`;
        yourVote = yourResult.rows[0]?.vote ?? null;
      }
    }

    return NextResponse.json({
      phase,
      chosenIdeaId,
      candidates: candidates.map(c => ({ ...c, arguments: argumentsByIdea[c.id] ?? [] })),
      votes,
      yourVote,
    });
  } catch (error) {
    console.error("GET /api/live error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
