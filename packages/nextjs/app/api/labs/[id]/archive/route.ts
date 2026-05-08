import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { id } = await params;
    const { archived } = await request.json();

    if (typeof archived !== "boolean") {
      return NextResponse.json({ error: "archived must be boolean" }, { status: 400 });
    }

    await initDb();

    const result = await sql`
      UPDATE labs_ideas
      SET archived = ${archived}, archived_by = ${archived ? wallet.toLowerCase() : null}
      WHERE id = ${id}
      RETURNING id, archived`;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, archived: result.rows[0].archived });
  } catch (error) {
    console.error("POST /api/labs/[id]/archive error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
