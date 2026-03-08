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

    // Fetch proposal
    const propResult = await sql`SELECT * FROM governance_proposals WHERE id = ${id}`;
    if (propResult.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const proposal = propResult.rows[0];

    // Fetch all responses, sorted by CV balance descending
    const responses = await sql`
      SELECT gr.wallet, gr.response, gr.reasoning, gr.human_override, gr.human_note,
             COALESCE(cb.balance, 0)::numeric as cv_balance
      FROM governance_responses gr
      LEFT JOIN clawdviction_balances cb ON LOWER(gr.wallet) = LOWER(cb.wallet)
      WHERE gr.proposal_id = ${id}
      ORDER BY cv_balance DESC`;

    if (responses.rows.length === 0) {
      return NextResponse.json({ error: "No responses to aggregate" }, { status: 400 });
    }

    // Format responses for the prompt
    // When a human has annotated or overridden a larva response, the human's position
    // is the REAL position — the larva was just a first draft. Format accordingly.
    const formatted = responses.rows
      .map((r, i) => {
        const cv = parseFloat(r.cv_balance).toFixed(0);
        const walletLabel = `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`;

        if (proposal.type === "vote") {
          // Votes: human_override replaces the larva vote entirely
          const effectiveVote = r.human_override || r.response;
          const overridden = r.human_override && r.human_override !== r.response;
          return `${i + 1}. Wallet ${walletLabel} (${cv} CV)\n  Vote: ${effectiveVote.toUpperCase()}${overridden ? ` [HUMAN CORRECTED — larva originally voted ${r.response}]` : ""}${r.reasoning ? `\n  Reasoning: ${r.reasoning}` : ""}`;
        } else {
          // RFCs: if human added a note, that IS the holder's real position
          if (r.human_note) {
            return `${i + 1}. Wallet ${walletLabel} (${cv} CV)\n  Position: ${r.human_note} [HUMAN — this is the holder's actual position]\n  (Larva originally said: ${r.response})`;
          }
          return `${i + 1}. Wallet ${walletLabel} (${cv} CV)\n  Position: ${r.response} [larva — no human correction]`;
        }
      })
      .join("\n\n");

    const systemPrompt =
      proposal.type === "vote"
        ? `You are synthesizing the results of a governance vote for $CLAWD token holders. Each holder's AI larva voted on their behalf, weighted by their CV (ClawdViction) score. When a vote is marked [HUMAN CORRECTED], the human's vote is the definitive position — the larva's original vote should be disregarded for tallying purposes. Analyze the votes, note the majority position, highlight any interesting dissent or reasoning, and deliver a clear ruling. Be direct and decisive. 2-4 paragraphs.`
        : `You are synthesizing community feedback on a governance RFC for $CLAWD token holders. Each holder's AI larva submitted a comment on their behalf, weighted by their CV (ClawdViction) score.

CRITICAL: When a response is marked [HUMAN], that is the holder's ACTUAL position and MUST be treated as their real stance. The larva's original comment was just a draft — the human correction supersedes it entirely. Weight the human's stated position as the definitive voice of that holder.

Responses marked [larva — no human correction] represent the larva's best guess at the holder's position, unchallenged by the holder.

Identify the dominant themes, areas of consensus, notable disagreements, and form an aggregated community opinion. Be insightful and direct. 2-4 paragraphs.`;

    const userPrompt = `Proposal: "${proposal.title}"\nQuestion: ${proposal.question}\n\nResponses (sorted by CV weight, highest first):\n\n${formatted}\n\n${proposal.type === "vote" ? "Form a ruling based on these votes." : "Form an aggregated community opinion from these comments."}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "zai-org-glm-5",
        max_tokens: 800,
        messages: [{ role: "user", content: systemPrompt + "\n\n" + userPrompt }],
        venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
      }),
    });

    const data = await res.json();
    const opinion = data.choices?.[0]?.message?.content;
    if (!opinion) return NextResponse.json({ error: "No response from model" }, { status: 500 });

    // Third pass: one-line summary
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
            content: `Here is a governance analysis:\n\n${opinion}\n\nGive me a single one-line answer that captures the bottom line. No preamble, no punctuation at the end, just the line.`,
          },
        ],
        venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
      }),
    });

    const shortData = await shortRes.json();
    const opinionShort = shortData.choices?.[0]?.message?.content?.trim() ?? null;

    // Store on the proposal
    await sql`
      UPDATE governance_proposals
      SET aggregated_opinion = ${opinion},
          aggregated_opinion_short = ${opinionShort}
      WHERE id = ${id}`;

    return NextResponse.json({ opinion, opinionShort });
  } catch (error) {
    console.error("POST /api/gov/[id]/aggregate error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
