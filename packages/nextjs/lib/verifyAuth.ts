import { NextRequest } from "next/server";
import { verifyMessage } from "viem";

export async function verifyAuth(request: NextRequest): Promise<string | null> {
  const signature = request.headers.get("x-auth-signature");
  const message = request.headers.get("x-auth-message");
  const address = request.headers.get("x-auth-address");

  if (!signature || !message || !address) return null;

  // Check expiry embedded in message
  const match = message.match(/Expires: (.+)/);
  if (!match) return null;
  const expiresAt = new Date(match[1]).getTime();
  if (isNaN(expiresAt) || expiresAt < Date.now()) return null;

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid ? address.toLowerCase() : null;
  } catch {
    return null;
  }
}
