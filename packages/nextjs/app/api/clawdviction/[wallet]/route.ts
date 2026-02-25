import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const STAKING_ADDRESS = "0xAF206d40F293f5892ce86986BaFF5BB426a188a1";
const ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getClawdviction",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet } = await params;
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
