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

    if (!(await isDbAvailable())) {
      return NextResponse.json(
        { success: false, error: "database unavailable" },
        { status: 503, headers: corsHeaders },
      );
    }

    const wallet = address.toLowerCase();
    const result = await sql`
      SELECT balance_micro, auto_topup_enabled, auto_topup_amount_micro, auto_topup_from
      FROM usdc_credits WHERE wallet = ${wallet}
    `;

    // No row = zero balance (not an error — every wallet implicitly has an empty ledger)
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: true, balanceMicro: 0, autoTopup: { enabled: false, amountMicro: 0, fromWallet: null } },
        { headers: corsHeaders },
      );
    }

    const row = result.rows[0];
    return NextResponse.json(
      {
        success: true,
        balanceMicro: Number(row.balance_micro),
        autoTopup: {
          enabled: !!row.auto_topup_enabled,
          amountMicro: Number(row.auto_topup_amount_micro),
          fromWallet: row.auto_topup_from || null,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("USDC balance lookup error:", error);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500, headers: corsHeaders });
  }
}
