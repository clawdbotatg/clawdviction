import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await initDb();

    // Insert queue items for wallets that don't have a response AND don't have a pending/processing queue item
    const result = await sql`
      INSERT INTO governance_queue (proposal_id, wallet, status)
      SELECT ${id}, ls.wallet, 'pending'
      FROM larva_seeds ls
      WHERE ls.completed = true
        AND NOT EXISTS (
          SELECT 1 FROM governance_responses gr
          WHERE gr.proposal_id = ${id} AND LOWER(gr.wallet) = LOWER(ls.wallet)
        )
        AND NOT EXISTS (
          SELECT 1 FROM governance_queue gq
          WHERE gq.proposal_id = ${id} AND LOWER(gq.wallet) = LOWER(ls.wallet)
            AND gq.status IN ('pending', 'processing')
        )
      ON CONFLICT DO NOTHING`;

    return NextResponse.json({ queued: result.rowCount ?? 0 });
  } catch (error) {
    console.error("POST /api/gov/[id]/collect error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
