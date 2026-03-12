import { NextRequest, NextResponse } from "next/server";
import { processForumQueue } from "~~/lib/forumQueue";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { processed, results } = await processForumQueue(10);
    return NextResponse.json({ processed, results });
  } catch (error) {
    console.error("POST /api/forum/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
