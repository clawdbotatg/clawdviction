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

const CV_SPEND_MESSAGE = "larv.ai CV Spend";
const CV_SPEND_SECRET = process.env.CV_SPEND_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, secret, amount } = body;

    // --- Validate inputs ---
    if (!wallet || !signature || !secret || amount === undefined) {
      return NextResponse.json({ success: false, error: "missing required fields" }, { status: 400 });
    }

    if (typeof amount !== "number" || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json({ success: false, error: "amount must be a positive integer" }, { status: 400 });
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

    // --- Fetch current balance ---
    const result = await sql`
      SELECT balance FROM clawdviction_balances WHERE wallet = ${walletLower}
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "wallet not found" }, { status: 404 });
    }

    const currentBalance = parseFloat(result.rows[0].balance);

    if (currentBalance < amount) {
      return NextResponse.json(
        { success: false, error: "insufficient balance", balance: currentBalance },
        { status: 402 },
      );
    }

    // --- Deduct CV ---
    const updated = await sql`
      UPDATE clawdviction_balances
      SET
        balance = balance - ${amount},
        total_spent = total_spent + ${amount}
      WHERE wallet = ${walletLower}
      RETURNING balance
    `;

    const newBalance = parseFloat(updated.rows[0].balance);

    return NextResponse.json({ success: true, newBalance });
  } catch (err) {
    console.error("CV spend error:", err);
    return NextResponse.json({ success: false, error: "internal server error" }, { status: 500 });
  }
}
