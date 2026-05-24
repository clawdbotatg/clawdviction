import { NextResponse } from "next/server";
import { initDb } from "~~/lib/db";
import { FORUM_POST_DIVISOR, LABS_SUBMIT_DIVISOR, getPostCosts } from "~~/lib/postCost";

export async function GET() {
  try {
    await initDb();
    const costs = await getPostCosts();
    return NextResponse.json({
      ...costs,
      forumDivisor: FORUM_POST_DIVISOR,
      labsDivisor: LABS_SUBMIT_DIVISOR,
    });
  } catch (error) {
    console.error("GET /api/post-costs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
