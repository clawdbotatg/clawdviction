import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

export const maxDuration = 30;

const STAKING_ADDRESS = "0xC9E377FB98a1aA6Ecf4B553cE1b57940121213bf" as const;

const StakedEvent = parseAbiItem(
  "event Staked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt)",
);
const UnstakedEvent = parseAbiItem(
  "event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt, uint256 unstakedAt)",
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

// 20M CLAWD staked 24h = 1,000,000 clawdviction
const DIVISOR = 1_728_000n * 1_000_000_000_000_000_000n; // 1.728e24

const client = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
});

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDb();
    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    }

    const now = new Date();
    const nowUnix = BigInt(Math.floor(now.getTime() / 1000));

    // Discover wallets: from DB + from on-chain Staked events
    const [dbRows, stakedLogs, unstakedLogs] = await Promise.all([
      sql`SELECT wallet, balance, last_accrued_at, accrual_rate, total_earned, total_spent FROM clawdviction_balances`,
      client.getLogs({
        address: STAKING_ADDRESS,
        event: StakedEvent,
        fromBlock: "earliest",
        toBlock: "latest",
      }),
      client.getLogs({
        address: STAKING_ADDRESS,
        event: UnstakedEvent,
        fromBlock: "earliest",
        toBlock: "latest",
      }),
    ]);

    // Collect all unique wallets
    const wallets = new Set<string>();
    for (const row of dbRows.rows) wallets.add(row.wallet.toLowerCase());
    for (const log of stakedLogs) if (log.args.user) wallets.add(log.args.user.toLowerCase());

    // Build unstaked clawdviction map (completed stakes token-seconds)
    const unstakedCvByWallet = new Map<string, bigint>();
    for (const log of unstakedLogs) {
      const w = log.args.user!.toLowerCase();
      const amount = log.args.amount ?? 0n;
      const stakedAt = log.args.stakedAt ?? 0n;
      const unstakedAt = log.args.unstakedAt ?? 0n;
      const cv = (amount * (unstakedAt - stakedAt)) / DIVISOR;
      unstakedCvByWallet.set(w, (unstakedCvByWallet.get(w) ?? 0n) + cv);
    }

    // Build existing DB row map
    const dbMap = new Map<string, (typeof dbRows.rows)[0]>();
    for (const row of dbRows.rows) dbMap.set(row.wallet.toLowerCase(), row);

    let processed = 0;

    for (const w of wallets) {
      try {
        // Get active stakes from contract
        const activeStakes = await client.readContract({
          address: STAKING_ADDRESS,
          abi: ABI,
          functionName: "getActiveStakes",
          args: [w as `0x${string}`],
        });

        const [amounts, stakedAts] = activeStakes;
        let currentTotalStaked = 0n;
        let activeAccrued = 0n;
        for (let i = 0; i < amounts.length; i++) {
          currentTotalStaked += amounts[i];
          activeAccrued += (amounts[i] * (nowUnix - stakedAts[i])) / DIVISOR;
        }

        const completedCv = unstakedCvByWallet.get(w) ?? 0n;
        const totalEarnedFromChain = completedCv + activeAccrued;

        const existing = dbMap.get(w);

        if (existing) {
          // Materialize pending accrual — floor decimals before BigInt cast (Postgres numeric can have decimals)
          const lastAccrued = BigInt(Math.floor(new Date(existing.last_accrued_at).getTime() / 1000));
          const elapsed = nowUnix - lastAccrued;
          const pending = (BigInt(Math.floor(Number(existing.accrual_rate))) * (elapsed > 0n ? elapsed : 0n)) / DIVISOR;
          const newBalance = BigInt(Math.floor(Number(existing.balance))) + pending;
          const newTotalEarned = BigInt(Math.floor(Number(existing.total_earned))) + pending;

          await sql`
            UPDATE clawdviction_balances SET
              balance = ${newBalance.toString()}::numeric,
              last_accrued_at = ${now.toISOString()},
              accrual_rate = ${currentTotalStaked.toString()}::numeric,
              total_earned = ${newTotalEarned.toString()}::numeric
            WHERE wallet = ${w}`;
        } else {
          // New wallet — seed with on-chain data
          await sql`
            INSERT INTO clawdviction_balances (wallet, balance, last_accrued_at, accrual_rate, total_earned, total_spent)
            VALUES (${w}, ${totalEarnedFromChain.toString()}::numeric, ${now.toISOString()}, ${currentTotalStaked.toString()}::numeric, ${totalEarnedFromChain.toString()}::numeric, 0)`;
        }

        processed++;
      } catch (e) {
        console.error(`Error processing wallet ${w}:`, e);
      }
    }

    return NextResponse.json({ status: "ok", processed, wallets: wallets.size, timestamp: now.toISOString() });
  } catch (error) {
    console.error("Cron accrue error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
