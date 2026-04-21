import { NextRequest } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// Public client for on-chain signature verification (supports both EOA and ERC-1271 smart contract wallets)
const publicClient = createPublicClient({
  chain: base,
  transport: http(
    `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "cR4WnXePioePZ5fFrnSiR"}`,
  ),
});

export async function verifyAuth(request: NextRequest): Promise<string | null> {
  const signature = request.headers.get("x-auth-signature");
  const messageEncoded = request.headers.get("x-auth-message");
  const address = request.headers.get("x-auth-address");

  if (!signature || !messageEncoded || !address) return null;

  // Message is base64-encoded to avoid \n characters in headers
  let message: string;
  try {
    message = Buffer.from(messageEncoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  // Check expiry embedded in message
  const match = message.match(/Expires: (.+)/);
  if (!match) return null;
  const expiresAt = new Date(match[1]).getTime();
  if (isNaN(expiresAt) || expiresAt < Date.now()) return null;

  try {
    const valid = await publicClient.verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid ? address.toLowerCase() : null;
  } catch {
    return null;
  }
}
