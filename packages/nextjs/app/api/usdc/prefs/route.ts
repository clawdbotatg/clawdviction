import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

/** Set auto-topup preferences for a wallet's USDC credit ledger.
 * Requires the same secret + "larv.ai CV Spend" signature as usdc/spend. */

const publicClient = createPublicClient({
  chain: base,
  transport: http(
    `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "cR4WnXePioePZ5fFrnSiR"}`,
  ),
});

const CV_SPEND_MESSAGE = "larv.ai CV Spend";
const CV_SPEND_SECRET = process.env.CV_SPEND_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, secret, enabled, amountMicro, fromWallet } = body;

    if (!wallet || !signature || !secret || typeof enabled !== "boolean") {
      return NextResponse.json({ success: false, error: "missing required fields" }, { status: 400 });
    }

    if (!CV_SPEND_SECRET || secret !== CV_SPEND_SECRET) {
      return NextResponse.json({ success: false, error: "invalid secret" }, { status: 403 });
    }

    if (enabled) {
      if (typeof amountMicro !== "number" || amountMicro <= 0 || !Number.isInteger(amountMicro)) {
        return NextResponse.json({ success: false, error: "amountMicro must be a positive integer" }, { status: 400 });
      }
      if (typeof fromWallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(fromWallet)) {
        return NextResponse.json({ success: false, error: "invalid fromWallet" }, { status: 400 });
      }
    }

    let signatureValid = false;
    try {
      signatureValid = await publicClient.verifyMessage({
        address: wallet as `0x${string}`,
        message: CV_SPEND_MESSAGE,
        signature: signature as `0x${string}`,
      });
    } catch {
      return NextResponse.json({ success: false, error: "invalid signature" }, { status: 400 });
    }

    if (!signatureValid) {
      return NextResponse.json({ success: false, error: "invalid signature" }, { status: 403 });
    }

    await initDb();
    if (!(await isDbAvailable())) {
      return NextResponse.json({ success: false, error: "database unavailable" }, { status: 503 });
    }

    const walletLower = wallet.toLowerCase();
    const amount = enabled ? amountMicro : 0;
    const from = enabled ? fromWallet.toLowerCase() : null;

    await sql`
      INSERT INTO usdc_credits (wallet, auto_topup_enabled, auto_topup_amount_micro, auto_topup_from)
      VALUES (${walletLower}, ${enabled}, ${amount}, ${from})
      ON CONFLICT (wallet) DO UPDATE SET
        auto_topup_enabled = EXCLUDED.auto_topup_enabled,
        auto_topup_amount_micro = EXCLUDED.auto_topup_amount_micro,
        auto_topup_from = EXCLUDED.auto_topup_from,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("USDC prefs error:", err);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500 });
  }
}
