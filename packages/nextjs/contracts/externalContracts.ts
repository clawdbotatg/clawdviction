import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const externalContracts = {
  8453: {
    UniswapV4StateView: {
      address: "0x571291b572ed32ce6d16d22b1f58d6d9fa1a51a5",
      abi: [
        {
          name: "getSlot0",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "poolId", type: "bytes32" }],
          outputs: [
            { name: "sqrtPriceX96", type: "uint160" },
            { name: "tick", type: "int24" },
            { name: "protocolFee", type: "uint24" },
            { name: "lpFee", type: "uint24" },
          ],
        },
      ] as const,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
