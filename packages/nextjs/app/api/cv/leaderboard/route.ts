import { NextResponse } from "next/server";
import { sql } from "~~/lib/db";

const DIVISOR = 1728000 * 1e18;

export async function GET() {
  const { rows } = await sql`
    SELECT
      wallet,
      balance::numeric as balance,
      accrual_rate::numeric as rate,
      last_accrued_at
    FROM clawdviction_balances
    WHERE accrual_rate::numeric > 0
  `;

  const now = Date.now();
  const stakers = rows
    .map(row => {
      const balance = Number(row.balance);
      const rate = Number(row.rate);
      const lastAccrued = row.last_accrued_at ? new Date(row.last_accrued_at).getTime() : now;
      const elapsedSec = (now - lastAccrued) / 1000;
      const liveCV = balance + (rate * elapsedSec) / DIVISOR;
      const stakedM = rate / 1e18 / 1e6;

      return {
        wallet: row.wallet as string,
        liveCV: Math.round(liveCV * 100) / 100,
        stakedM: Math.round(stakedM * 100) / 100,
      };
    })
    .sort((a, b) => b.liveCV - a.liveCV)
    .slice(0, 100);

  return NextResponse.json({ stakers });
}
