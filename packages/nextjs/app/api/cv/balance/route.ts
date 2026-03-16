import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ success: false, error: "missing address" }, { status: 400, headers: corsHeaders });
  }

  try {
    await initDb();

    if (!isDbAvailable()) {
      return NextResponse.json(
        { success: false, error: "database unavailable" },
        { status: 503, headers: corsHeaders },
      );
    }

    const wallet = address.toLowerCase();
    const result = await sql`SELECT balance FROM clawdviction_balances WHERE wallet = ${wallet}`;

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "wallet not found" }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, balance: parseFloat(result.rows[0].balance) }, { headers: corsHeaders });
  } catch (error) {
    console.error("CV balance lookup error:", error);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500, headers: corsHeaders });
  }
}
