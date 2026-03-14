import { NextRequest, NextResponse } from "next/server";
import { initDb } from "~~/lib/db";
import { aggregateLabsIdea } from "~~/lib/labsAggregate";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await initDb();

    const { opinion, opinionShort } = await aggregateLabsIdea(id);
    return NextResponse.json({ opinion, opinionShort });
  } catch (error) {
    console.error("POST /api/labs/[id]/aggregate error:", error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
