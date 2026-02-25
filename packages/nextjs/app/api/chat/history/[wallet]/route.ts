import { NextRequest, NextResponse } from "next/server";

// Server-side backend URL (no NEXT_PUBLIC_ — not exposed to client)
// In production with Vercel Postgres, this route will query the DB directly.
// For now, proxies to the Express backend if available.
const BACKEND_URL = process.env.BACKEND_URL || "";

export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/history/${wallet}`, {
        cache: "no-store",
      });
      const data = await res.json();
      return NextResponse.json(data);
    } catch {
      // Backend unreachable — fall through to empty
    }
  }

  // TODO: When Vercel Postgres is set up, query chat_messages table here.
  // For now return empty — history lives in the Express backend's SQLite.
  return NextResponse.json({ messages: [] });
}
