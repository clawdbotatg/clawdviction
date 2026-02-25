import { NextRequest, NextResponse } from "next/server";

// In production (Vercel), we can't run Docker containers.
// Return a simple status that tells the frontend the larva is "ready"
// (the chat API route handles the actual AI interaction)
export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  return NextResponse.json({
    status: "running",
    running: true,
    wallet,
    message: "Larva is ready (serverless mode)",
  });
}
