import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import { base } from "viem/chains";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

const STAKING_ADDRESS = "0xAF206d40F293f5892ce86986BaFF5BB426a188a1" as const;

const ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getClawdviction",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getActiveStakes",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
      { internalType: "uint256[]", name: "stakedAts", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const client = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: rawWallet } = await params;
    let wallet: string;
    try {
      wallet = getAddress(rawWallet);
    } catch {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    await initDb();
    const dbOk = await isDbAvailable();

    if (dbOk) {
      const result = await sql`
        SELECT balance, accrual_rate, last_accrued_at, total_earned, total_spent
        FROM clawdviction_balances WHERE wallet = ${wallet}`;

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const balance = BigInt(row.balance);
        const accrualRate = BigInt(row.accrual_rate);
        // Compute current optimistic value for backwards compat
        const lastAccruedAt = new Date(row.last_accrued_at);
        const elapsed = BigInt(Math.max(0, Math.floor((Date.now() - lastAccruedAt.getTime()) / 1000)));
        const current = balance + accrualRate * elapsed;

        return NextResponse.json({
          clawdviction: current.toString(),
          balance: balance.toString(),
          accrualRate: accrualRate.toString(),
          lastAccruedAt: lastAccruedAt.toISOString(),
          totalEarned: row.total_earned.toString(),
          totalSpent: row.total_spent.toString(),
        });
      }

      // No row — seed from contract
      try {
        const [onChainScore, [amounts]] = await Promise.all([
          client.readContract({
            address: STAKING_ADDRESS,
            abi: ABI,
            functionName: "getClawdviction",
            args: [wallet as `0x${string}`],
          }),
          client.readContract({
            address: STAKING_ADDRESS,
            abi: ABI,
            functionName: "getActiveStakes",
            args: [wallet as `0x${string}`],
          }),
        ]);

        let currentStaked = 0n;
        for (const a of amounts) currentStaked += a;

        const nowISO = new Date().toISOString();
        await sql`
          INSERT INTO clawdviction_balances (wallet, balance, last_accrued_at, accrual_rate, total_earned, total_spent)
          VALUES (${wallet}, ${onChainScore.toString()}, ${nowISO}, ${currentStaked.toString()}, ${onChainScore.toString()}, '0')
          ON CONFLICT (wallet) DO NOTHING`;

        return NextResponse.json({
          clawdviction: onChainScore.toString(),
          balance: onChainScore.toString(),
          accrualRate: currentStaked.toString(),
          lastAccruedAt: nowISO,
          totalEarned: onChainScore.toString(),
          totalSpent: "0",
        });
      } catch {
        // Contract call failed, return 0
        return NextResponse.json({
          clawdviction: "0",
          balance: "0",
          accrualRate: "0",
          lastAccruedAt: new Date().toISOString(),
          totalEarned: "0",
          totalSpent: "0",
        });
      }
    }

    // DB not available — fallback to contract
    const clawdviction = await client.readContract({
      address: STAKING_ADDRESS,
      abi: ABI,
      functionName: "getClawdviction",
      args: [wallet as `0x${string}`],
    });
    return NextResponse.json({ clawdviction: clawdviction.toString() });
  } catch (error) {
    console.error("Error reading clawdviction:", error);
    return NextResponse.json({ clawdviction: "0" });
  }
}
