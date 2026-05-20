import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function GET(request: NextRequest) {
  const verified = await verifyAuth(request);
  if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (verified.toLowerCase() !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const surface = searchParams.get("surface");
  const errorType = searchParams.get("type");
  const walletFilter = searchParams.get("wallet")?.toLowerCase() ?? null;
  const sinceHours = Math.min(Math.max(parseInt(searchParams.get("hours") ?? "168"), 1), 720); // default 7d, cap 30d
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "200"), 1), 1000);

  await initDb();

  // Build the WHERE clause conditionally — @vercel/postgres template literals don't
  // support optional filters, so we use a single query with COALESCE / NULL-or-equal.
  const result = await sql`
    SELECT id, surface, error_type, wallet, status_code, message, context, created_at
    FROM larva_errors
    WHERE created_at > NOW() - (${sinceHours} || ' hours')::interval
      AND (${surface}::text IS NULL OR surface = ${surface})
      AND (${errorType}::text IS NULL OR error_type = ${errorType})
      AND (${walletFilter}::text IS NULL OR wallet = ${walletFilter})
    ORDER BY created_at DESC
    LIMIT ${limit}`;

  // Aggregate counts for the dashboard view — same filter envelope as the list
  const counts = await sql`
    SELECT surface, error_type, COUNT(*)::int AS count
    FROM larva_errors
    WHERE created_at > NOW() - (${sinceHours} || ' hours')::interval
      AND (${surface}::text IS NULL OR surface = ${surface})
      AND (${errorType}::text IS NULL OR error_type = ${errorType})
      AND (${walletFilter}::text IS NULL OR wallet = ${walletFilter})
    GROUP BY surface, error_type
    ORDER BY count DESC`;

  // Top failing wallets — useful for spotting one user hitting issues repeatedly
  const topWallets = await sql`
    SELECT wallet, COUNT(*)::int AS count
    FROM larva_errors
    WHERE created_at > NOW() - (${sinceHours} || ' hours')::interval
      AND wallet IS NOT NULL
      AND (${surface}::text IS NULL OR surface = ${surface})
      AND (${errorType}::text IS NULL OR error_type = ${errorType})
    GROUP BY wallet
    ORDER BY count DESC
    LIMIT 10`;

  return NextResponse.json({
    errors: result.rows,
    counts: counts.rows,
    topWallets: topWallets.rows,
    sinceHours,
    total: result.rows.length,
  });
}
