import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import { base } from "viem/chains";
import { initDb, isDbAvailable, sql } from "~~/lib/db";

const STAKING_ADDRESS = "0xAF206d40F293f5892ce86986BaFF5BB426a188a1" as const;

const STAKING_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getStakeCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    name: "stakes",
    outputs: [
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "stakedAt", type: "uint256" },
    ],
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

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  // Get all wallets from larva_seeds (completed) + clawdviction_balances
  const [seeds, existing] = await Promise.all([
    sql`SELECT wallet FROM larva_seeds WHERE completed = true`,
    sql`SELECT wallet FROM clawdviction_balances`,
  ]);

  const walletSet = new Set<string>();
  for (const row of seeds.rows) {
    try {
      walletSet.add(getAddress(row.wallet));
    } catch {
      /* skip invalid */
    }
  }
  for (const row of existing.rows) {
    try {
      walletSet.add(getAddress(row.wallet));
    } catch {
      /* skip invalid */
    }
  }

  const wallets = Array.from(walletSet);
  if (wallets.length === 0) {
    return NextResponse.json({ updated: 0, wallets: [] });
  }

  const now = new Date();
  const nowISO = now.toISOString();

  const results = await Promise.allSettled(
    wallets.map(async wallet => {
      // Get active stakes from contract
      const [amounts] = await client.readContract({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: "getActiveStakes",
        args: [wallet as `0x${string}`],
      });

      // Sum active stake amounts (in wei)
      let currentStaked = 0n;
      for (const amount of amounts) {
        currentStaked += amount;
      }

      // Get existing balance row
      const existingRow = await sql`
        SELECT balance, last_accrued_at, accrual_rate, total_earned, total_spent
        FROM clawdviction_balances WHERE wallet = ${wallet}`;

      let oldBalance = 0n;
      let oldAccrualRate = 0n;
      let lastAccruedAt = now;
      let totalEarned = 0n;
      let totalSpent = 0n;

      if (existingRow.rows.length > 0) {
        const row = existingRow.rows[0];
        oldBalance = BigInt(row.balance);
        oldAccrualRate = BigInt(row.accrual_rate);
        lastAccruedAt = new Date(row.last_accrued_at);
        totalEarned = BigInt(row.total_earned);
        totalSpent = BigInt(row.total_spent);
      }

      // Calculate pending accrual: old accrual_rate * seconds elapsed
      const secondsElapsed = BigInt(Math.max(0, Math.floor((now.getTime() - lastAccruedAt.getTime()) / 1000)));
      const pending = oldAccrualRate * secondsElapsed;

      const newBalance = oldBalance + pending;
      const newTotalEarned = totalEarned + pending;

      // Upsert
      await sql`
        INSERT INTO clawdviction_balances (wallet, balance, last_accrued_at, accrual_rate, total_earned, total_spent)
        VALUES (${wallet}, ${newBalance.toString()}, ${nowISO}, ${currentStaked.toString()}, ${newTotalEarned.toString()}, ${totalSpent.toString()})
        ON CONFLICT (wallet) DO UPDATE SET
          balance = ${newBalance.toString()},
          last_accrued_at = ${nowISO},
          accrual_rate = ${currentStaked.toString()},
          total_earned = ${newTotalEarned.toString()}`;

      return wallet;
    }),
  );

  const updated = results.filter(r => r.status === "fulfilled").length;
  const updatedWallets = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map(r => r.value);

  return NextResponse.json({ updated, wallets: updatedWallets });
}
