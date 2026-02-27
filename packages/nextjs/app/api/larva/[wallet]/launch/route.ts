import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "~~/lib/verifyAuth";

// In production, larva is always "running" in serverless mode
export async function POST(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const verified = await verifyAuth(request);
  if (!verified || verified !== wallet.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    status: "running",
    wallet,
    message: "Larva launched (serverless mode)",
  });
}
