import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

/** Credit a wallet's USDC balance. Server-to-server only (shared secret) —
 * the caller (denar.ai's backend) has already verified the on-chain payment.
 * Idempotent by deposit_key: the same deposit can never credit twice. */

const CV_SPEND_SECRET = process.env.CV_SPEND_SECRET;
// Sanity cap per single credit — a topup larger than this is almost certainly a bug
const MAX_CREDIT_MICRO = Number(process.env.USDC_MAX_CREDIT_MICRO || 1_000_000_000); // $1,000

const VALID_SOURCES = new Set(["x402", "transfer", "autotopup"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret, wallet, amountMicro, depositKey, source } = body;

    if (!secret || !wallet || amountMicro === undefined || !depositKey || !source) {
      return NextResponse.json({ success: false, error: "missing required fields" }, { status: 400 });
    }

    if (!CV_SPEND_SECRET || secret !== CV_SPEND_SECRET) {
      return NextResponse.json({ success: false, error: "invalid secret" }, { status: 403 });
    }

    if (
      typeof amountMicro !== "number" ||
      amountMicro <= 0 ||
      !Number.isInteger(amountMicro) ||
      amountMicro > MAX_CREDIT_MICRO
    ) {
      return NextResponse.json({ success: false, error: "invalid amountMicro" }, { status: 400 });
    }

    if (typeof depositKey !== "string" || depositKey.length > 200) {
      return NextResponse.json({ success: false, error: "invalid depositKey" }, { status: 400 });
    }

    if (!VALID_SOURCES.has(source)) {
      return NextResponse.json({ success: false, error: "invalid source" }, { status: 400 });
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ success: false, error: "invalid wallet" }, { status: 400 });
    }

    await initDb();
    if (!(await isDbAvailable())) {
      return NextResponse.json({ success: false, error: "database unavailable" }, { status: 503 });
    }

    const walletLower = wallet.toLowerCase();

    // One atomic statement: record the topup (no-op on duplicate key) and, only if
    // it was recorded, add to the balance. A replayed depositKey credits nothing.
    const result = await sql`
      WITH ins AS (
        INSERT INTO usdc_topups (deposit_key, wallet, amount_micro, source)
        VALUES (${depositKey}, ${walletLower}, ${amountMicro}, ${source})
        ON CONFLICT (deposit_key) DO NOTHING
        RETURNING amount_micro
      )
      INSERT INTO usdc_credits (wallet, balance_micro, total_deposited_micro)
      SELECT ${walletLower}, amount_micro, amount_micro FROM ins
      ON CONFLICT (wallet) DO UPDATE SET
        balance_micro = usdc_credits.balance_micro + EXCLUDED.balance_micro,
        total_deposited_micro = usdc_credits.total_deposited_micro + EXCLUDED.total_deposited_micro,
        updated_at = NOW()
      RETURNING balance_micro
    `;

    if (result.rows.length === 0) {
      // Duplicate deposit key — already credited. Report current balance.
      const current = await sql`SELECT balance_micro FROM usdc_credits WHERE wallet = ${walletLower}`;
      const balanceMicro = current.rows.length > 0 ? Number(current.rows[0].balance_micro) : 0;
      return NextResponse.json({ success: true, duplicate: true, newBalanceMicro: balanceMicro });
    }

    return NextResponse.json({ success: true, newBalanceMicro: Number(result.rows[0].balance_micro) });
  } catch (err) {
    console.error("USDC credit error:", err);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500 });
  }
}
