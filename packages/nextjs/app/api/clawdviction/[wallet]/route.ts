import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, getAddress, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

const STAKING_ADDRESS = "0xFE69980a1203d664488A73aE806514d2a04C1F8a" as const;
// Also read from old contract for historical clawdviction
const OLD_STAKING_ADDRESS = "0xAF206d40F293f5892ce86986BaFF5BB426a188a1" as const;

const StakedEvent = parseAbiItem(
  "event Staked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt)",
);
const UnstakedEvent = parseAbiItem(
  "event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt, uint256 unstakedAt)",
);

// Old contract events (different signature)
const OldStakedEvent = parseAbiItem("event Staked(address indexed user, uint256 amount, uint256 stakeIndex)");
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

// Old contract deployed around block 42600842
const OLD_CONTRACT_START_BLOCK = 42600842n;

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: rawWallet } = await params;
    let wallet: `0x${string}`;
    try {
      wallet = getAddress(rawWallet) as `0x${string}`;
    } catch {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const now = BigInt(Math.floor(Date.now() / 1000));

    // Fetch old contract events for historical clawdviction
    let oldClawdviction = 0n;
    try {
      const [oldStakedLogs, oldUnstakedLogs] = await Promise.all([
        client.getLogs({
          address: OLD_STAKING_ADDRESS,
          event: OldStakedEvent,
          args: { user: wallet },
          fromBlock: OLD_CONTRACT_START_BLOCK,
          toBlock: "latest",
        }),
        client.getLogs({
          address: OLD_STAKING_ADDRESS,
          event: OldUnstakedEvent,
          args: { user: wallet },
          fromBlock: OLD_CONTRACT_START_BLOCK,
          toBlock: "latest",
        }),
      ]);

      // Old unstaked events include the clawdviction directly
      for (const log of oldUnstakedLogs) {
        oldClawdviction += log.args.clawdviction ?? 0n;
      }

      // Check if any old stakes are still active (they shouldn't be since Austin unstaked everything)
      // Build a map of stakeIndex -> staked info
      const oldStakes = new Map<bigint, { amount: bigint; block: bigint }>();
      for (const log of oldStakedLogs) {
        oldStakes.set(log.args.stakeIndex!, { amount: log.args.amount!, block: log.blockNumber });
      }
      for (const log of oldUnstakedLogs) {
        oldStakes.delete(log.args.stakeIndex!);
      }
      // Any remaining old stakes are still active (unlikely but handle it)
      // We can't easily get their stakedAt from old events (old Staked didn't have stakedAt)
      // so just skip — Austin unstaked everything
    } catch (e) {
      console.error("Error fetching old contract events:", e);
    }

    // Fetch new contract events + active stakes
    const [, unstakedLogs, activeStakes] = await Promise.all([
      client.getLogs({
        address: STAKING_ADDRESS,
        event: StakedEvent,
        args: { user: wallet },
        fromBlock: "earliest",
        toBlock: "latest",
      }),
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

    // Calculate clawdviction from completed stakes (new contract)
    let newCompleted = 0n;
    for (const log of unstakedLogs) {
      const amount = log.args.amount ?? 0n;
      const stakedAt = log.args.stakedAt ?? 0n;
      const unstakedAt = log.args.unstakedAt ?? 0n;
      newCompleted += amount * (unstakedAt - stakedAt);
    }

    // Calculate clawdviction from active stakes
    let activeAccrued = 0n;
    let currentTotalStaked = 0n;
    const [amounts, stakedAts] = activeStakes;
    for (let i = 0; i < amounts.length; i++) {
      const amount = amounts[i];
      const stakedAt = stakedAts[i];
      activeAccrued += amount * (now - stakedAt);
      currentTotalStaked += amount;
    }

    const totalClawdviction = oldClawdviction + newCompleted + activeAccrued;

    return NextResponse.json({
      clawdviction: totalClawdviction.toString(),
      accrualRate: currentTotalStaked.toString(),
    });
  } catch (error) {
    console.error("Error reading clawdviction:", error);
    return NextResponse.json({ clawdviction: "0", accrualRate: "0" });
  }
}
