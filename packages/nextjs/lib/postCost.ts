import { sql } from "~~/lib/db";

// CV accrues per-second using the same DIVISOR as the rest of the app
// (lib/cvSpend, /api/cv/leaderboard, /api/chat). Keep this in sync.
const DIVISOR = 1728000 * 1e18;

// Tuned so forum ≈ 10M and labs ≈ 30M CV at a top balance of ~3.9B.
// Adjust if the top holder changes by an order of magnitude.
export const FORUM_POST_DIVISOR = 391;
export const LABS_SUBMIT_DIVISOR = 130;

export type PostCosts = {
  maxCv: number;
  forum: number;
  labs: number;
};

/**
 * Returns the largest LIVE CV balance across all wallets — stored balance
 * plus accrual since last_accrued_at. Used to dynamically price forum/labs
 * posts so they stay meaningful as the top holder's CV inflates.
 */
export async function getMaxLiveCv(): Promise<number> {
  const { rows } = await sql`
    SELECT balance::numeric as balance, accrual_rate::numeric as rate, last_accrued_at
    FROM clawdviction_balances`;
  const now = Date.now();
  let max = 0;
  for (const row of rows) {
    const balance = Number(row.balance);
    const rate = Number(row.rate);
    const lastAccrued = row.last_accrued_at ? new Date(row.last_accrued_at).getTime() : now;
    const elapsedSec = (now - lastAccrued) / 1000;
    const live = balance + (rate * elapsedSec) / DIVISOR;
    if (live > max) max = live;
  }
  return max;
}

export async function getPostCosts(): Promise<PostCosts> {
  const maxCv = await getMaxLiveCv();
  return {
    maxCv,
    forum: Math.ceil(maxCv / FORUM_POST_DIVISOR),
    labs: Math.ceil(maxCv / LABS_SUBMIT_DIVISOR),
  };
}
