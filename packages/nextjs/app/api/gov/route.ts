import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function GET() {
  try {
    await initDb();
    const result = await sql`
      SELECT p.id, p.type, p.title, p.question, p.created_by, p.created_at, p.status,
             p.options, p.closes_at, p.duration_hours,
             COUNT(r.id)::int as response_count
      FROM governance_proposals p
      LEFT JOIN governance_responses r ON r.proposal_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC`;
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("GET /api/gov error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { title, question, type, options, duration_hours } = await request.json();
    if (!title || !question || !type || !["rfc", "vote"].includes(type)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    await initDb();

    let result;
    if (type === "vote" && options && Array.isArray(options) && options.length > 0) {
      const durationHrs = typeof duration_hours === "number" && duration_hours > 0 ? duration_hours : 24;
      result = await sql`
        INSERT INTO governance_proposals (type, title, question, created_by, options, duration_hours, closes_at)
        VALUES (${type}, ${title}, ${question}, ${wallet}, ${JSON.stringify(options)}::jsonb, ${durationHrs}, NOW() + ${durationHrs + " hours"}::interval)
        RETURNING *`;
    } else {
      result = await sql`
        INSERT INTO governance_proposals (type, title, question, created_by)
        VALUES (${type}, ${title}, ${question}, ${wallet})
        RETURNING *`;
    }

    const proposal = result.rows[0];

    // Queue all wallets that have completed onboarding (have a larva with context)
    const wallets = await sql`SELECT wallet FROM larva_seeds WHERE completed = true`;
    for (const row of wallets.rows) {
      const w = row.wallet.toLowerCase();
      await sql`
        INSERT INTO governance_queue (proposal_id, wallet)
        VALUES (${proposal.id}, ${w})
        ON CONFLICT DO NOTHING`;
    }

    return NextResponse.json(proposal);
  } catch (error) {
    console.error("POST /api/gov error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
