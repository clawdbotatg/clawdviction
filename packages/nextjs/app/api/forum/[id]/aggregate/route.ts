import { NextRequest, NextResponse } from "next/server";
import { initDb, sql } from "~~/lib/db";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const apiKey = process.env.VENICE_API_KEY;
    const baseUrl = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    await initDb();

    const postResult = await sql`SELECT * FROM forum_posts WHERE id = ${id}`;
    if (postResult.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const post = postResult.rows[0];

    const responses = await sql`
      SELECT fr.wallet, fr.response, COALESCE(cb.balance, 0)::numeric as cv_balance
      FROM forum_responses fr
      LEFT JOIN clawdviction_balances cb ON LOWER(fr.wallet) = LOWER(cb.wallet)
      WHERE fr.post_id = ${id}
      ORDER BY cv_balance DESC`;

    if (responses.rows.length === 0) {
      return NextResponse.json({ error: "No responses to aggregate" }, { status: 400 });
    }

    const formatted = responses.rows
      .map((r, i) => {
        const cv = parseFloat(r.cv_balance).toFixed(0);
        const w = `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`;
        return `${i + 1}. ${w} (${cv} CV): ${r.response}`;
      })
      .join("\n\n");

    const userPrompt = `Forum Post: "${post.title}"\n\n${post.body}\n\nLarva Perspectives (sorted by CV weight):\n\n${formatted}\n\nSynthesize these perspectives into an aggregated community opinion. Identify themes, consensus, and notable disagreements. Be insightful and direct. 2-4 paragraphs.`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "zai-org-glm-5",
        max_tokens: 800,
        messages: [{ role: "user", content: userPrompt }],
        venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
      }),
    });

    const data = await res.json();
    const opinion = data.choices?.[0]?.message?.content;
    if (!opinion) return NextResponse.json({ error: "No response from model" }, { status: 500 });

    // One-line summary
    const shortRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "zai-org-glm-5",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `Here is an aggregated opinion:\n\n${opinion}\n\nGive me a single one-line summary. No preamble, no punctuation at the end, just the line.`,
          },
        ],
        venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
      }),
    });

    const shortData = await shortRes.json();
    const opinionShort = shortData.choices?.[0]?.message?.content?.trim() ?? null;

    await sql`
      UPDATE forum_posts
      SET aggregated_opinion = ${opinion}, aggregated_opinion_short = ${opinionShort}
      WHERE id = ${id}`;

    return NextResponse.json({ opinion, opinionShort });
  } catch (error) {
    console.error("POST /api/forum/[id]/aggregate error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
