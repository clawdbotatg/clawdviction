import { NextRequest, NextResponse } from "next/server";
import { processLabsQueue } from "~~/lib/labsQueue";

export const maxDuration = 60;

async function handleProcess(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { processed, results } = await processLabsQueue(10);
    return NextResponse.json({ processed, results });
  } catch (error) {
    console.error("/api/labs/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleProcess(request);
}

export async function POST(request: NextRequest) {
  return handleProcess(request);
}
