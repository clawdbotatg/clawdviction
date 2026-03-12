import { NextRequest, NextResponse } from "next/server";
import { processForumQueue } from "~~/lib/forumQueue";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  try {
    // No auth required — CV payment at trigger time is the authorization
    const { processed, results } = await processForumQueue(10);
    return NextResponse.json({ processed, results });
  } catch (error) {
    console.error("POST /api/forum/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
