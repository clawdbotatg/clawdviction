import { NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";

export async function GET() {
  try {
    await initDb();

    const result = await sql`
      SELECT
        COALESCE(SUM(accrual_rate), 0) AS total_staked_wei,
        COALESCE(SUM(balance), 0) AS total_cv_wei
      FROM clawdviction_balances`;

    const row = result.rows[0];
    const totalStakedClawd = Number(row.total_staked_wei) / 1e18;
    const totalCvGenerated = Number(row.total_cv_wei) / 1e18;

    return NextResponse.json({ totalStakedClawd, totalCvGenerated });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
