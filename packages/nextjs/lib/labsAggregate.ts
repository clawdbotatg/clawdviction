import { initDb, sql } from "~~/lib/db";
import { runLarvaConversation } from "~~/lib/larvaAi";

export async function aggregateLabsIdea(ideaId: number): Promise<{ opinion: string; opinionShort: string | null }> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error("No BANKR_API_KEY configured");
  }

  await initDb();

  const ideaResult = await sql`SELECT * FROM labs_ideas WHERE id = ${ideaId}`;
  if (ideaResult.rows.length === 0) throw new Error("Idea not found");
  const idea = ideaResult.rows[0];

  const responses = await sql`
    SELECT lr.wallet, lr.response, COALESCE(cb.balance, 0)::numeric as cv_balance
    FROM labs_responses lr
    LEFT JOIN clawdviction_balances cb ON LOWER(lr.wallet) = LOWER(cb.wallet)
    WHERE lr.idea_id = ${ideaId}
    ORDER BY cv_balance DESC`;

  if (responses.rows.length === 0) throw new Error("No responses to aggregate");

  const formatted = responses.rows
    .map((r, i) => {
      const cv = parseFloat(r.cv_balance).toFixed(0);
      const w = `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`;
      return `${i + 1}. ${w} (${cv} CV): ${r.response}`;
    })
    .join("\n\n");

  const userPrompt = `Build Idea: "${idea.title}"\n\n${idea.description}\n\nLarva Perspectives (sorted by CV weight):\n\n${formatted}\n\nSynthesize these perspectives into an aggregated community opinion. Identify themes, consensus, and notable disagreements. Be insightful and direct. 2-4 paragraphs. Do not use markdown formatting — no headers, no bold, no bullet points. Plain prose paragraphs only.`;

  const opinionRes = await runLarvaConversation({
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1024,
  });
  const opinion = opinionRes.text;
  if (!opinion) throw new Error("No response from model");

  const shortResult = await runLarvaConversation({
    messages: [
      {
        role: "user",
        content: `Here is an aggregated opinion:\n\n${opinion}\n\nGive me a single one-line summary. No preamble, no punctuation at the end, just the line.`,
      },
    ],
    maxTokens: 100,
  });
  const opinionShort = shortResult.text?.trim() || null;

  await sql`
    UPDATE labs_ideas
    SET aggregated_opinion = ${opinion}, aggregated_opinion_short = ${opinionShort}
    WHERE id = ${ideaId}`;

  return { opinion, opinionShort: opinionShort ?? "" };
}
