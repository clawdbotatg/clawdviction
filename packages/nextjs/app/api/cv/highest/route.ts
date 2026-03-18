import { NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    await initDb();

    if (!isDbAvailable()) {
      return NextResponse.json(
        { success: false, error: "database unavailable" },
        { status: 503, headers: corsHeaders },
      );
    }

    const result = await sql`SELECT balance, accrual_rate, last_accrued_at FROM clawdviction_balances`;

    const DIVISOR = 1728000 * 1e18;
    const now = Date.now();
    let highest = 0;

    for (const row of result.rows) {
      const balance = Number(row.balance);
      const rate = Number(row.accrual_rate);
      const lastAccrued = row.last_accrued_at ? new Date(row.last_accrued_at).getTime() : now;
      const elapsedSec = (now - lastAccrued) / 1000;
      const liveCV = balance + (rate * elapsedSec) / DIVISOR;
      if (liveCV > highest) highest = liveCV;
    }

    return NextResponse.json(
      { success: true, highestCVBalance: Math.round(highest * 100) / 100 },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("CV highest balance error:", error);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500, headers: corsHeaders });
  }
}
