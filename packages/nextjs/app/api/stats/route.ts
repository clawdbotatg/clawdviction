import { NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";

export async function GET() {
  try {
    await initDb();

    const result = await sql`
      SELECT
        COALESCE(SUM(accrual_rate), 0) AS total_staked_wei,
        COALESCE(SUM(total_earned), 0) AS total_cv_earned
      FROM clawdviction_balances`;

    const row = result.rows[0];
    // accrual_rate is staked amount in wei — divide by 1e18 to get CLAWD
    const totalStakedClawd = Number(row.total_staked_wei) / 1e18;
    // total_earned is already in human-readable CV units (cron divides by DIVISOR=1.728e24 before storing)
    const totalCvGenerated = Number(row.total_cv_earned);

    return NextResponse.json({ totalStakedClawd, totalCvGenerated });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
