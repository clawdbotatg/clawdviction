import { NextRequest, NextResponse } from "next/server";
import { isLabsJobsAdmin } from "~~/lib/admins";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const PHASES = ["idea", "build", "test", "shipped"] as const;
type Phase = (typeof PHASES)[number];

export async function GET() {
  try {
    await initDb();
    const { rows } = await sql`
      SELECT id, title, phase, archived, created_by, created_at, updated_at
      FROM labs_jobs
      ORDER BY updated_at DESC`;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/labs-jobs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!isLabsJobsAdmin(wallet)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, phase } = await request.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }
    if (title.length > 140) {
      return NextResponse.json({ error: "Title too long (max 140)" }, { status: 400 });
    }
    const startPhase: Phase = PHASES.includes(phase) ? phase : "idea";

    await initDb();
    const { rows } = await sql`
      INSERT INTO labs_jobs (title, phase, created_by)
      VALUES (${title.trim()}, ${startPhase}, ${wallet!.toLowerCase()})
      RETURNING *`;
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("POST /api/labs-jobs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
