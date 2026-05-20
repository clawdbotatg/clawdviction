import { initDb, sql } from "~~/lib/db";
import { runLarvaConversation } from "~~/lib/larvaAi";

// Aggregate forum post responses via the shared larva model (BANKR claude-sonnet-4.6).
// Shared by aggregate/route.ts and forumQueue.ts.
export async function aggregateForumPost(postId: number): Promise<{ opinion: string; opinionShort: string | null }> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error("No BANKR_API_KEY configured");
  }

  await initDb();

  const postResult = await sql`SELECT * FROM forum_posts WHERE id = ${postId}`;
  if (postResult.rows.length === 0) throw new Error("Post not found");
  const post = postResult.rows[0];

  const responses = await sql`
    SELECT fr.wallet, fr.response, COALESCE(cb.balance, 0)::numeric as cv_balance
    FROM forum_responses fr
    LEFT JOIN clawdviction_balances cb ON LOWER(fr.wallet) = LOWER(cb.wallet)
    WHERE fr.post_id = ${postId}
    ORDER BY cv_balance DESC`;

  if (responses.rows.length === 0) throw new Error("No responses to aggregate");

  const formatted = responses.rows
    .map((r, i) => {
      const cv = parseFloat(r.cv_balance).toFixed(0);
      const w = `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`;
      return `${i + 1}. ${w} (${cv} CV): ${r.response}`;
    })
    .join("\n\n");

  const userPrompt = `Forum Post: "${post.title}"\n\n${post.body}\n\nLarva Perspectives (sorted by CV weight):\n\n${formatted}\n\nSynthesize these perspectives into an aggregated community opinion. Identify themes, consensus, and notable disagreements. Be insightful and direct. 2-4 paragraphs. Do not use markdown formatting — no headers, no bold, no bullet points. Plain prose paragraphs only.`;

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
    UPDATE forum_posts
    SET aggregated_opinion = ${opinion}, aggregated_opinion_short = ${opinionShort}
    WHERE id = ${postId}`;

  return { opinion, opinionShort: opinionShort ?? "" };
}
