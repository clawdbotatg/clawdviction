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

    const { note } = await request.json();
    if (!note || typeof note !== "string") {
      return NextResponse.json({ error: "Missing note" }, { status: 400 });
    }
    if (note.length > 1000) {
      return NextResponse.json({ error: "Note too long (max 1000 characters)" }, { status: 400 });
    }

    // Verify proposal is rfc type
    const proposal = await sql`SELECT type FROM governance_proposals WHERE id = ${id}`;
    if (proposal.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (proposal.rows[0].type !== "rfc") return NextResponse.json({ error: "Not an RFC proposal" }, { status: 400 });

    // Check user has a response
    const existing =
      await sql`SELECT id FROM governance_responses WHERE proposal_id = ${id} AND LOWER(wallet) = ${wallet}`;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "No larva response to annotate" }, { status: 400 });
    }

    await sql`UPDATE governance_responses SET human_note = ${note} WHERE proposal_id = ${id} AND LOWER(wallet) = ${wallet}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/gov/[id]/annotate error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
