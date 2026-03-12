import { compressMemory, initDb, sql } from "~~/lib/db";
import { LARVA_BASE_PROMPT } from "~~/lib/larvaContext";
import { formatAnswersAsQA } from "~~/lib/questions";

/**
 * Process up to `limit` pending forum_queue items via Venice AI.
 * Returns the number processed and result details.
 * Caller is responsible for calling initDb() before this if needed.
 */
export async function processForumQueue(
  limit = 10,
): Promise<{ processed: number; results: { wallet: string; response: string }[] }> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new Error("No VENICE_API_KEY");

  await initDb();

  // Atomically claim pending rows — prevents race conditions with concurrent calls
  const claimed = await sql`
    UPDATE forum_queue
    SET status = 'processing'
    WHERE id IN (
      SELECT id FROM forum_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, post_id, wallet`;

  if (claimed.rows.length === 0) {
    return { processed: 0, results: [] };
  }

  // Fetch post details for each claimed row
  const pending: { rows: { id: number; post_id: number; wallet: string; title: string; body: string }[] } = {
    rows: [],
  };
  for (const row of claimed.rows) {
    const post = await sql`SELECT title, body FROM forum_posts WHERE id = ${row.post_id}`;
    pending.rows.push({
      id: row.id,
      post_id: row.post_id,
      wallet: row.wallet,
      title: post.rows[0]?.title || "",
      body: post.rows[0]?.body || "",
    });
  }

  const results: { wallet: string; response: string }[] = [];
  const baseUrl = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";

  for (const item of pending.rows) {
    try {
      const walletLower = item.wallet.toLowerCase();

      // Ensure memory snapshot exists
      try {
        const snapCheck = await sql`SELECT snapshot FROM memory_snapshots WHERE LOWER(wallet) = ${walletLower}`;
        if (snapCheck.rows.length === 0 || !snapCheck.rows[0].snapshot) {
          await compressMemory(walletLower);
        }
      } catch {
        /* best effort */
      }

      // Fetch context
      let onboardingContext = "";
      try {
        const seedResult =
          await sql`SELECT answers FROM larva_seeds WHERE LOWER(wallet) = ${walletLower} AND completed = true`;
        if (seedResult.rows.length > 0 && seedResult.rows[0].answers) {
          onboardingContext = formatAnswersAsQA(seedResult.rows[0].answers as Record<string, string>);
        }
      } catch {
        /* ignore */
      }

      let memorySnapshot = "";
      try {
        const snapResult = await sql`SELECT snapshot FROM memory_snapshots WHERE LOWER(wallet) = ${walletLower}`;
        if (snapResult.rows.length > 0 && snapResult.rows[0].snapshot) {
          memorySnapshot = snapResult.rows[0].snapshot as string;
        }
      } catch {
        /* ignore */
      }

      let chatContext = "";
      try {
        const chatResult =
          await sql`SELECT role, content FROM chat_messages WHERE LOWER(wallet) = ${walletLower} ORDER BY created_at DESC LIMIT 30`;
        if (chatResult.rows.length > 0) {
          chatContext = chatResult.rows
            .reverse()
            .map(r => `${r.role}: ${r.content}`)
            .join("\n");
        }
      } catch {
        /* ignore */
      }

      const systemPrompt =
        LARVA_BASE_PROMPT(item.wallet) +
        (onboardingContext ? `\n\nHolder's onboarding answers:\n${onboardingContext}` : "") +
        (memorySnapshot ? `\n\nMemory summary from previous conversations:\n${memorySnapshot}` : "") +
        (chatContext ? `\n\nRecent chat history:\n${chatContext}` : "");

      const userMessage = `FORUM POST: "${item.title}"\n\n${item.body}\n\nBased on everything you know about this holder's values and preferences, share your perspective on this forum post. Keep it to 2-4 sentences.`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "zai-org-glm-5",
          max_tokens: 800,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
        }),
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";

      await sql`
        INSERT INTO forum_responses (post_id, wallet, response)
        VALUES (${item.post_id}, ${walletLower}, ${text})
        ON CONFLICT (post_id, wallet) DO UPDATE SET response = ${text}, created_at = NOW()`;

      await sql`UPDATE forum_queue SET status = 'done', processed_at = NOW() WHERE id = ${item.id}`;
      results.push({ wallet: item.wallet, response: text });
    } catch (e) {
      console.error(`Forum queue processing error for item ${item.id}:`, e);
      await sql`UPDATE forum_queue SET status = 'failed' WHERE id = ${item.id}`;
    }
  }

  return { processed: results.length, results };
}
