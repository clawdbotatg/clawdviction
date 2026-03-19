import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDb();

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const proposalResult = await sql`SELECT * FROM governance_proposals WHERE id = ${id}`;
    if (proposalResult.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const proposal = proposalResult.rows[0];

    const countResult = await sql`SELECT COUNT(*)::int as count FROM governance_responses WHERE proposal_id = ${id}`;
    const responseCount = countResult.rows[0].count;

    const queueCount =
      await sql`SELECT COUNT(*)::int as count FROM governance_queue WHERE proposal_id = ${id} AND status = 'pending'`;
    const pendingCount = queueCount.rows[0].count;

    // Check auth
    const wallet = await verifyAuth(request);

    // Compute vote tallies for all users (public data)
    let tallies = null;
    let cvTotals = null;
    let quadraticTotals = null;
    if (proposal.type === "vote") {
      if (proposal.options && Array.isArray(proposal.options)) {
        const tallyResult = await sql`
          SELECT COALESCE(human_override, chosen_option, response) as effective_option,
                 COUNT(*)::int as count,
                 COALESCE(SUM(cv_committed), 0)::bigint as cv_total,
                 ROUND(COALESCE(SUM(SQRT(cv_committed::float)), 0)::numeric, 2) as quadratic_power
          FROM governance_responses
          WHERE proposal_id = ${id}
          GROUP BY effective_option`;
        tallies = {} as Record<string, number>;
        cvTotals = {} as Record<string, number>;
        quadraticTotals = {} as Record<string, number>;
        for (const opt of proposal.options as string[]) {
          tallies[opt] = 0;
          cvTotals[opt] = 0;
          quadraticTotals[opt] = 0;
        }
        for (const row of tallyResult.rows) {
          const key = (row.effective_option || "").trim();
          if (key in tallies) {
            tallies[key] = row.count;
            cvTotals[key] = Number(row.cv_total);
            quadraticTotals[key] = Number(row.quadratic_power);
          }
        }
      } else {
        const tallyResult = await sql`
          SELECT COALESCE(human_override, response) as effective_vote, COUNT(*)::int as count
          FROM governance_responses
          WHERE proposal_id = ${id}
          GROUP BY effective_vote`;
        tallies = { yes: 0, no: 0, abstain: 0 };
        for (const row of tallyResult.rows) {
          const key = row.effective_vote.toLowerCase().trim();
          if (key in tallies) tallies[key as keyof typeof tallies] = row.count;
        }
      }
    }

    // Fetch all larva responses for public transparency (RFC + vote proposals)
    let larvaResponses: {
      wallet: string;
      response: string;
      chosen_option: string | null;
      reasoning: string | null;
      created_at: string;
    }[] = [];
    if (proposal.type === "rfc" || proposal.type === "vote") {
      const lrResult = await sql`
        SELECT wallet, response, chosen_option, reasoning, created_at
        FROM governance_responses
        WHERE proposal_id = ${id}
        ORDER BY created_at ASC`;
      larvaResponses = lrResult.rows as typeof larvaResponses;
    }

    if (wallet?.toLowerCase() === ADMIN_WALLET) {
      // Admin: full response list joined with CV balance, sorted by balance DESC
      const responses = await sql`
        SELECT gr.wallet, gr.response, gr.reasoning, gr.human_override, gr.human_note, gr.created_at,
               gr.chosen_option, gr.cv_committed,
               COALESCE(cb.balance, 0)::numeric as cv_balance
        FROM governance_responses gr
        LEFT JOIN clawdviction_balances cb ON gr.wallet = cb.wallet
        WHERE gr.proposal_id = ${id}
        ORDER BY cv_balance DESC`;

      return NextResponse.json({
        proposal,
        responseCount,
        pendingCount,
        responses: responses.rows,
        tallies,
        cvTotals,
        quadraticTotals,
        larvaResponses,
      });
    } else if (wallet) {
      // Regular user: their response + queue status
      const userResponse = await sql`
        SELECT gr.response, gr.reasoning, gr.human_override, gr.human_note, gr.created_at,
               gr.chosen_option, gr.cv_committed,
               COALESCE(cb.balance, 0)::numeric as cv_balance
        FROM governance_responses gr
        LEFT JOIN clawdviction_balances cb ON gr.wallet = cb.wallet
        WHERE gr.proposal_id = ${id} AND gr.wallet = ${wallet}`;
      const queueStatus = await sql`
        SELECT status FROM governance_queue
        WHERE proposal_id = ${id} AND wallet = ${wallet}`;

      return NextResponse.json({
        proposal,
        responseCount,
        pendingCount,
        tallies,
        cvTotals,
        quadraticTotals,
        userResponse: userResponse.rows[0] || null,
        queueStatus: queueStatus.rows[0]?.status || null,
        larvaResponses,
      });
    }

    // Public: proposal + count + tallies
    return NextResponse.json({
      proposal,
      responseCount,
      pendingCount,
      tallies,
      cvTotals,
      quadraticTotals,
      larvaResponses,
    });
  } catch (error) {
    console.error("GET /api/gov/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
