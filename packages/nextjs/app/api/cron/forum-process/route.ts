import { NextRequest, NextResponse } from "next/server";
import { processForumQueue } from "~~/lib/forumQueue";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { processed } = await processForumQueue(10);
    return NextResponse.json({ processed });
  } catch (error) {
    console.error("Cron forum-process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
