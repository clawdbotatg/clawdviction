import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;

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
