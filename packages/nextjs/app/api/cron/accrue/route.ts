import { NextResponse } from "next/server";

// Stub — clawdviction is now calculated off-chain from events. Kept so Vercel cron doesn't error.
export async function GET() {
  return NextResponse.json({ status: "noop", message: "Clawdviction accrual moved off-chain" });
}
