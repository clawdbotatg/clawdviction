import { NextRequest, NextResponse } from "next/server";

// In production, larva is always "running" in serverless mode
export async function POST(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  return NextResponse.json({
    status: "running",
    wallet,
    message: "Larva launched (serverless mode)",
  });
}
