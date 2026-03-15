"use client";

import { useFetchNativeCurrencyPrice } from "@scaffold-ui/hooks";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const CLAWD_POOL_ID = "0x9fd58e73d8047cb14ac540acd141d3fc1a41fb6252d674b730faf62fe24aa8ce";

export function useClawdPrice(): number {
  const { price: ethPrice } = useFetchNativeCurrencyPrice();

  const { data: slot0 } = useScaffoldReadContract({
    contractName: "UniswapV4StateView",
    functionName: "getSlot0",
    args: [CLAWD_POOL_ID as `0x${string}`],
  });

  if (!slot0 || !ethPrice) return 0;

  try {
    const sqrtPriceX96 = slot0[0]; // uint160 as bigint
    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const clawdPerWeth = sqrtPrice * sqrtPrice;
    if (clawdPerWeth === 0) return 0;
    const ethPerClawd = 1 / clawdPerWeth;
    return ethPerClawd * ethPrice;
  } catch {
    return 0;
  }
}
