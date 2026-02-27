import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const verified = await verifyAuth(request);
  if (!verified || verified !== wallet.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  if (!(await isDbAvailable())) {
    return NextResponse.json({ messages: [] });
  }

  try {
    const result = await sql`
      SELECT role, content FROM chat_messages
      WHERE wallet = ${wallet}
      ORDER BY created_at DESC
      LIMIT 100`;

    return NextResponse.json({ messages: result.rows.reverse() });
  } catch (error) {
    console.error("History fetch error:", error);
    return NextResponse.json({ messages: [] });
  }
}
