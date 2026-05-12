import { initDb, sql } from "~~/lib/db";

/**
 * Aggregate governance proposal responses using Anthropic Haiku.
 * Shared by api/gov/[id]/aggregate/route.ts and the gov-process cron.
 */
export async function aggregateGovProposal(
  proposalId: number,
): Promise<{ opinion: string; opinionShort: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY");

  await initDb();

  const propResult = await sql`SELECT * FROM governance_proposals WHERE id = ${proposalId}`;
  if (propResult.rows.length === 0) throw new Error("Proposal not found");
  const proposal = propResult.rows[0];

  const responses = await sql`
    SELECT gr.wallet, gr.response, gr.reasoning, gr.human_override, gr.human_note,
           COALESCE(cb.balance, 0)::numeric as cv_balance
    FROM governance_responses gr
    LEFT JOIN clawdviction_balances cb ON LOWER(gr.wallet) = LOWER(cb.wallet)
    WHERE gr.proposal_id = ${proposalId}
    ORDER BY cv_balance DESC`;

  if (responses.rows.length === 0) throw new Error("No responses to aggregate");

  const formatted = responses.rows
    .map((r, i) => {
      const cv = parseFloat(r.cv_balance).toFixed(0);
      const walletLabel = `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`;

      if (proposal.type === "vote") {
        const effectiveVote = r.human_override || r.response;
        const overridden = r.human_override && r.human_override !== r.response;
        return `${i + 1}. Wallet ${walletLabel} (${cv} CV)\n  Vote: ${effectiveVote.toUpperCase()}${overridden ? ` [HUMAN CORRECTED — larva originally voted ${r.response}]` : ""}${r.reasoning ? `\n  Reasoning: ${r.reasoning}` : ""}`;
      } else {
        if (r.human_note) {
          return `${i + 1}. Wallet ${walletLabel} (${cv} CV)\n  Position: ${r.human_note} [HUMAN — this is the holder's actual position]\n  (Larva originally said: ${r.response})`;
        }
        return `${i + 1}. Wallet ${walletLabel} (${cv} CV)\n  Position: ${r.response} [larva — no human correction]`;
      }
    })
    .join("\n\n");

  const systemPrompt =
    proposal.type === "vote"
      ? `You are synthesizing the results of a governance vote for $CLAWD token holders. Each holder's AI larva voted on their behalf, weighted by their CV (conviction) score. When a vote is marked [HUMAN CORRECTED], the human's vote is the definitive position — the larva's original vote should be disregarded for tallying purposes. Analyze the votes, note the majority position, highlight any interesting dissent or reasoning, and deliver a clear ruling. Be direct and decisive. 2-4 paragraphs.`
      : `You are synthesizing community feedback on a governance RFC for $CLAWD token holders. Each holder's AI larva submitted a comment on their behalf, weighted by their CV (conviction) score.

CRITICAL: When a response is marked [HUMAN], that is the holder's ACTUAL position and MUST be treated as their real stance. The larva's original comment was just a draft — the human correction supersedes it entirely. Weight the human's stated position as the definitive voice of that holder.

Responses marked [larva — no human correction] represent the larva's best guess at the holder's position, unchallenged by the holder.

Identify the dominant themes, areas of consensus, notable disagreements, and form an aggregated community opinion. Be insightful and direct. 2-4 paragraphs.`;

  const userPrompt = `Proposal: "${proposal.title}"\nQuestion: ${proposal.question}\n\nResponses (sorted by CV weight, highest first):\n\n${formatted}\n\n${proposal.type === "vote" ? "Form a ruling based on these votes." : "Form an aggregated community opinion from these comments."}`;

  // Aggregation call
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = await res.json();
  const opinion = data.content?.[0]?.text;
  if (!opinion) throw new Error("No response from Haiku model");

  // One-line summary
  const shortRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Here is a governance analysis:\n\n${opinion}\n\nGive me a single one-line answer that captures the bottom line. No preamble, no punctuation at the end, just the line.`,
        },
      ],
    }),
  });

  const shortData = await shortRes.json();
  const opinionShort = shortData.content?.[0]?.text?.trim() ?? null;

  await sql`
    UPDATE governance_proposals
    SET aggregated_opinion = ${opinion},
        aggregated_opinion_short = ${opinionShort}
    WHERE id = ${proposalId}`;

  return { opinion, opinionShort };
}
