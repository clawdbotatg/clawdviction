import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, getAddress, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

const STAKING_ADDRESS = "0xC9E377FB98a1aA6Ecf4B553cE1b57940121213bf" as const;
const OLD_STAKING_ADDRESS = "0xAF206d40F293f5892ce86986BaFF5BB426a188a1" as const;

const UnstakedEvent = parseAbiItem(
  "event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt, uint256 unstakedAt)",
);

const OldUnstakedEvent = parseAbiItem(
  "event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 clawdviction)",
);

const ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getActiveStakes",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
      { internalType: "uint256[]", name: "stakedAts", type: "uint256[]" },
      { internalType: "uint256[]", name: "indices", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const client = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
});

// 20M CLAWD staked 24h = 1,000,000 clawdviction
const DIVISOR = 1_728_000n * 1_000_000_000_000_000_000n; // 1.728e24

const OLD_CONTRACT_START_BLOCK = 42600842n;

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: rawWallet } = await params;
    let wallet: `0x${string}`;
    try {
      wallet = getAddress(rawWallet) as `0x${string}`;
    } catch {
      return NextResponse.json({ error: "Invalid address" }, { status: 400, headers: corsHeaders });
    }

    const walletLower = wallet.toLowerCase();
    const now = new Date();
    const nowUnix = BigInt(Math.floor(now.getTime() / 1000));

    await initDb();
    const dbOk = await isDbAvailable();

    if (dbOk) {
      const result = await sql`SELECT * FROM clawdviction_balances WHERE wallet = ${walletLower}`;
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const balance = BigInt(Math.floor(Number(row.balance)));
        const accrualRate = BigInt(Math.floor(Number(row.accrual_rate)));
        const lastAccruedAt = new Date(row.last_accrued_at);
        const elapsed = nowUnix - BigInt(Math.floor(lastAccruedAt.getTime() / 1000));
        const pending = (accrualRate * (elapsed > 0n ? elapsed : 0n)) / DIVISOR;
        const totalCv = balance + pending;

        // Return per-second rate as float for frontend optimistic counter
        const accrualRateFloat = Number(accrualRate) / Number(DIVISOR);

        return NextResponse.json(
          {
            clawdviction: totalCv.toString(),
            accrualRate: accrualRateFloat,
            lastAccruedAt: lastAccruedAt.toISOString(),
            balance: balance.toString(),
            totalEarned: row.total_earned.toString(),
            totalSpent: row.total_spent.toString(),
          },
          { headers: corsHeaders },
        );
      }
    }

    // No DB row — seed from chain
    // Old contract historical
    let oldClawdviction = 0n;
    try {
      const oldUnstakedLogs = await client.getLogs({
        address: OLD_STAKING_ADDRESS,
        event: OldUnstakedEvent,
        args: { user: wallet },
        fromBlock: OLD_CONTRACT_START_BLOCK,
        toBlock: "latest",
      });
      for (const log of oldUnstakedLogs) {
        oldClawdviction += (log.args.clawdviction ?? 0n) / DIVISOR;
      }
    } catch (e) {
      console.error("Error fetching old contract events:", e);
    }

    // New contract
    const [unstakedLogs, activeStakes] = await Promise.all([
      client.getLogs({
        address: STAKING_ADDRESS,
        event: UnstakedEvent,
        args: { user: wallet },
        fromBlock: "earliest",
        toBlock: "latest",
      }),
      client.readContract({
        address: STAKING_ADDRESS,
        abi: ABI,
        functionName: "getActiveStakes",
        args: [wallet],
      }),
    ]);

    let newCompleted = 0n;
    for (const log of unstakedLogs) {
      const amount = log.args.amount ?? 0n;
      const stakedAt = log.args.stakedAt ?? 0n;
      const unstakedAt = log.args.unstakedAt ?? 0n;
      newCompleted += (amount * (unstakedAt - stakedAt)) / DIVISOR;
    }

    let activeAccrued = 0n;
    let currentTotalStaked = 0n;
    const [amounts, stakedAts] = activeStakes;
    for (let i = 0; i < amounts.length; i++) {
      activeAccrued += (amounts[i] * (nowUnix - stakedAts[i])) / DIVISOR;
      currentTotalStaked += amounts[i];
    }

    const totalCv = oldClawdviction + newCompleted + activeAccrued;

    // Seed into DB
    if (dbOk) {
      try {
        await sql`
          INSERT INTO clawdviction_balances (wallet, balance, last_accrued_at, accrual_rate, total_earned, total_spent)
          VALUES (${walletLower}, ${totalCv.toString()}::numeric, ${now.toISOString()}, ${currentTotalStaked.toString()}::numeric, ${totalCv.toString()}::numeric, 0)
          ON CONFLICT (wallet) DO NOTHING`;
      } catch (e) {
        console.error("Error seeding DB:", e);
      }
    }

    return NextResponse.json(
      {
        clawdviction: totalCv.toString(),
        accrualRate: Number(currentTotalStaked) / Number(DIVISOR),
        lastAccruedAt: now.toISOString(),
        balance: totalCv.toString(),
        totalEarned: totalCv.toString(),
        totalSpent: "0",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error reading clawdviction:", error);
    return NextResponse.json({ clawdviction: "0", accrualRate: 0, error: true }, { status: 500, headers: corsHeaders });
  }
}
