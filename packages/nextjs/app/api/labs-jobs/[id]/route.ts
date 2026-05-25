import { NextRequest, NextResponse } from "next/server";
import { isLabsJobsAdmin } from "~~/lib/admins";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const PHASES = ["idea", "build", "test", "shipped"] as const;
type Phase = (typeof PHASES)[number];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!isLabsJobsAdmin(wallet)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const updates: { title?: string; phase?: Phase; archived?: boolean } = {};

    if (typeof body.title === "string") {
      if (!body.title.trim()) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      if (body.title.length > 140) {
        return NextResponse.json({ error: "Title too long (max 140)" }, { status: 400 });
      }
      updates.title = body.title.trim();
    }
    if (typeof body.phase === "string") {
      if (!PHASES.includes(body.phase as Phase)) {
        return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      }
      updates.phase = body.phase as Phase;
    }
    if (typeof body.archived === "boolean") {
      updates.archived = body.archived;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await initDb();

    // Build the update with conditional COALESCE so we only touch supplied fields.
    const { rows } = await sql`
      UPDATE labs_jobs SET
        title = COALESCE(${updates.title ?? null}, title),
        phase = COALESCE(${updates.phase ?? null}, phase),
        archived = COALESCE(${updates.archived ?? null}, archived),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("PATCH /api/labs-jobs/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!isLabsJobsAdmin(wallet)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await initDb();
    await sql`DELETE FROM labs_jobs WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/labs-jobs/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
