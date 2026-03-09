import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";

  // Redirect clawdviction.vercel.app → larv.ai (same path + query)
  if (host.includes("clawdviction.vercel.app")) {
    const url = new URL(request.url);
    url.host = "larv.ai";
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url.toString(), 301);
  }

  return NextResponse.next();
}
