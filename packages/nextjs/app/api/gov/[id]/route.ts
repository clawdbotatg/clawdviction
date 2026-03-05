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

    if (wallet?.toLowerCase() === ADMIN_WALLET) {
      // Admin: full response list joined with CV balance, sorted by balance DESC
      const responses = await sql`
        SELECT gr.wallet, gr.response, gr.reasoning, gr.human_override, gr.human_note, gr.created_at,
               COALESCE(cb.balance, 0)::numeric as cv_balance
        FROM governance_responses gr
        LEFT JOIN clawdviction_balances cb ON gr.wallet = cb.wallet
        WHERE gr.proposal_id = ${id}
        ORDER BY cv_balance DESC`;

      // Vote tallies — use human_override when present
      let tallies = null;
      if (proposal.type === "vote") {
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

      return NextResponse.json({ proposal, responseCount, pendingCount, responses: responses.rows, tallies });
    } else if (wallet) {
      // Regular user: their response + queue status
      const userResponse = await sql`
        SELECT gr.response, gr.reasoning, gr.human_override, gr.human_note, gr.created_at,
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
        userResponse: userResponse.rows[0] || null,
        queueStatus: queueStatus.rows[0]?.status || null,
      });
    }

    // Public: just proposal + count
    return NextResponse.json({ proposal, responseCount, pendingCount });
  } catch (error) {
    console.error("GET /api/gov/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
