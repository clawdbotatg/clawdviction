import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const externalContracts = {
  8453: {
    UniswapV4StateView: {
      address: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
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
