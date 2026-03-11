import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDb();

    const wallet = await verifyAuth(request);
    if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json();

    // Verify proposal is a vote type
    const proposal = await sql`SELECT type, options FROM governance_proposals WHERE id = ${id}`;
    if (proposal.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (proposal.rows[0].type !== "vote") return NextResponse.json({ error: "Not a vote proposal" }, { status: 400 });

    // Check user has a response to override
    const existing =
      await sql`SELECT id FROM governance_responses WHERE proposal_id = ${id} AND LOWER(wallet) = ${wallet}`;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "No larva response to override" }, { status: 400 });
    }

    // Require active stake to override — prevents stake-briefly-then-exit governance manipulation.
    // accrual_rate mirrors current staked amount (set by cron); 0 means fully unstaked.
    const stakeRow = await sql`SELECT accrual_rate FROM clawdviction_balances WHERE LOWER(wallet) = ${wallet}`;
    if (stakeRow.rows.length === 0 || BigInt(Math.floor(Number(stakeRow.rows[0].accrual_rate))) === 0n) {
      return NextResponse.json({ error: "Must have active stake to override vote" }, { status: 403 });
    }

    const options = proposal.rows[0].options;

    if (options && Array.isArray(options) && options.length > 0) {
      // Multi-option vote
      const { chosen_option, cv_committed } = body;
      if (!chosen_option) {
        return NextResponse.json({ error: "chosen_option required" }, { status: 400 });
      }
      const validOptions = options as string[];
      if (!validOptions.includes(chosen_option)) {
        return NextResponse.json({ error: `Invalid option. Valid: ${validOptions.join(", ")}` }, { status: 400 });
      }

      // Update human_override with chosen option, optionally update cv_committed
      if (typeof cv_committed === "number" && cv_committed >= 0) {
        await sql`UPDATE governance_responses
          SET human_override = ${chosen_option}, cv_committed = ${cv_committed}
          WHERE proposal_id = ${id} AND LOWER(wallet) = ${wallet}`;
      } else {
        await sql`UPDATE governance_responses
          SET human_override = ${chosen_option}
          WHERE proposal_id = ${id} AND LOWER(wallet) = ${wallet}`;
      }
    } else {
      // Legacy yes/no/abstain vote
      const { response } = body;
      if (!["yes", "no", "abstain"].includes(response)) {
        return NextResponse.json({ error: "Invalid response" }, { status: 400 });
      }
      await sql`UPDATE governance_responses SET human_override = ${response} WHERE proposal_id = ${id} AND LOWER(wallet) = ${wallet}`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/gov/[id]/override error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
