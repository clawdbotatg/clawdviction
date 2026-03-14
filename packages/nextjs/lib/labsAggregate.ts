import { initDb, sql } from "~~/lib/db";

export async function aggregateLabsIdea(ideaId: number): Promise<{ opinion: string; opinionShort: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY");

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
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = await res.json();
  const opinion = data.content?.[0]?.text;
  if (!opinion) throw new Error("No response from model");

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
          content: `Here is an aggregated opinion:\n\n${opinion}\n\nGive me a single one-line summary. No preamble, no punctuation at the end, just the line.`,
        },
      ],
    }),
  });

  const shortData = await shortRes.json();
  const opinionShort = shortData.content?.[0]?.text?.trim() ?? null;

  await sql`
    UPDATE labs_ideas
    SET aggregated_opinion = ${opinion}, aggregated_opinion_short = ${opinionShort}
    WHERE id = ${ideaId}`;

  return { opinion, opinionShort: opinionShort ?? "" };
}
