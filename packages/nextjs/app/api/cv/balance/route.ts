import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ success: false, error: "missing address" }, { status: 400 });
  }

  try {
    await initDb();

    if (!isDbAvailable()) {
      return NextResponse.json({ success: false, error: "database unavailable" }, { status: 503 });
    }

    const wallet = address.toLowerCase();
    const result = await sql`SELECT balance FROM clawdviction_balances WHERE wallet = ${wallet}`;

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "wallet not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, balance: parseFloat(result.rows[0].balance) });
  } catch (error) {
    console.error("CV balance lookup error:", error);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500 });
  }
}
