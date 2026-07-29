import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

// Public client for on-chain signature verification (supports both EOA and ERC-1271 smart contract wallets)
const publicClient = createPublicClient({
  chain: base,
  transport: http(
    `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "cR4WnXePioePZ5fFrnSiR"}`,
  ),
});

// Same message as CV spend — one signature authorizes both ledgers
const CV_SPEND_MESSAGE = "larv.ai CV Spend";
const CV_SPEND_SECRET = process.env.CV_SPEND_SECRET;

async function readAutoTopup(wallet: string) {
  const res = await sql`
    SELECT balance_micro, auto_topup_enabled, auto_topup_amount_micro, auto_topup_from
    FROM usdc_credits WHERE wallet = ${wallet}
  `;
  if (res.rows.length === 0) {
    return { balanceMicro: 0, autoTopup: { enabled: false, amountMicro: 0, fromWallet: null } };
  }
  const row = res.rows[0];
  return {
    balanceMicro: Number(row.balance_micro),
    autoTopup: {
      enabled: !!row.auto_topup_enabled,
      amountMicro: Number(row.auto_topup_amount_micro),
      fromWallet: row.auto_topup_from || null,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, secret, amountMicro } = body;

    // --- Validate inputs ---
    if (!wallet || !signature || !secret || amountMicro === undefined) {
      return NextResponse.json({ success: false, error: "missing required fields" }, { status: 400 });
    }

    if (typeof amountMicro !== "number" || amountMicro <= 0 || !Number.isInteger(amountMicro)) {
      return NextResponse.json({ success: false, error: "amountMicro must be a positive integer" }, { status: 400 });
    }

    // --- Verify shared secret ---
    if (!CV_SPEND_SECRET || secret !== CV_SPEND_SECRET) {
      return NextResponse.json({ success: false, error: "invalid secret" }, { status: 403 });
    }

    // --- Verify wallet signature ---
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

    // --- Check DB availability ---
    await initDb();
    if (!(await isDbAvailable())) {
      return NextResponse.json({ success: false, error: "database unavailable" }, { status: 503 });
    }

    const walletLower = wallet.toLowerCase();

    // --- Deduct atomically: single conditional UPDATE, no check-then-update race ---
    const updated = await sql`
      UPDATE usdc_credits
      SET
        balance_micro = balance_micro - ${amountMicro},
        total_spent_micro = total_spent_micro + ${amountMicro},
        updated_at = NOW()
      WHERE wallet = ${walletLower} AND balance_micro >= ${amountMicro}
      RETURNING balance_micro
    `;

    if (updated.rows.length === 0) {
      // Insufficient balance or no row — either way a 402 (never 404: a wallet with
      // no row simply has a zero balance). Include auto-topup prefs so the caller
      // can pull a top-up without an extra round trip.
      const state = await readAutoTopup(walletLower);
      return NextResponse.json({ success: false, error: "insufficient balance", ...state }, { status: 402 });
    }

    return NextResponse.json({ success: true, newBalanceMicro: Number(updated.rows[0].balance_micro) });
  } catch (err) {
    console.error("USDC spend error:", err);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500 });
  }
}
