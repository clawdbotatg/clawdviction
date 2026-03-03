import { NextRequest, NextResponse } from "next/server";
import { sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";
const DIVISOR = 1728000 * 1e18;

export async function GET(request: NextRequest) {
  const verified = await verifyAuth(request);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (verified.toLowerCase() !== ADMIN_WALLET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { rows } = await sql`
    SELECT
      cb.wallet,
      cb.balance::numeric as balance,
      cb.accrual_rate::numeric as rate,
      cb.last_accrued_at,
      ls.completed as onboarded,
      COUNT(cm.id) FILTER (WHERE cm.role = 'user') as user_msgs,
      COUNT(cm.id) FILTER (WHERE cm.role = 'assistant') as bot_msgs,
      COUNT(cm.id) FILTER (WHERE cm.role = 'assistant' AND cm.content LIKE '%confused clicking%') as errors,
      MAX(cm.created_at) as last_chat
    FROM clawdviction_balances cb
    LEFT JOIN larva_seeds ls ON LOWER(ls.wallet) = cb.wallet
    LEFT JOIN chat_messages cm ON LOWER(cm.wallet) = cb.wallet
    GROUP BY cb.wallet, cb.balance, cb.accrual_rate, cb.last_accrued_at, ls.completed
    ORDER BY cb.accrual_rate::numeric DESC
  `;

  const now = Date.now();
  const stakers = rows.map(row => {
    const balance = Number(row.balance);
    const rate = Number(row.rate);
    const lastAccrued = row.last_accrued_at ? new Date(row.last_accrued_at).getTime() : now;
    const elapsedMs = now - lastAccrued;
    const elapsedSec = elapsedMs / 1000;
    const liveCV = balance + (rate * elapsedSec) / DIVISOR;
    const stakedM = rate / 1e18 / 1e6; // accrual_rate IS the staked amount in wei

    const userMsgs = Number(row.user_msgs);
    const botMsgs = Number(row.bot_msgs);
    const errors = Number(row.errors);
    const cleanBotMsgs = botMsgs - errors;

    let chatStatus = "no chat";
    if (userMsgs > 0 || botMsgs > 0) {
      if (errors === 0) chatStatus = "✅ clean";
      else if (errors < botMsgs) chatStatus = "⚠️ some errors";
      else chatStatus = "❌ all errors";
    }

    return {
      wallet: row.wallet,
      stakedM: stakedM.toFixed(2),
      liveCV: liveCV.toFixed(2),
      onboarded: row.onboarded === true,
      userMsgs,
      botMsgs: cleanBotMsgs,
      errors,
      chatStatus,
      lastChat: row.last_chat ? new Date(row.last_chat).toISOString() : null,
    };
  });

  stakers.sort((a, b) => parseFloat(b.liveCV) - parseFloat(a.liveCV));

  return NextResponse.json({ stakers });
}
