import { compressMemory, initDb, sql } from "~~/lib/db";
import { aggregateForumPost } from "~~/lib/forumAggregate";
import { runLarvaConversation } from "~~/lib/larvaAi";
import { errMsg, logLarvaError } from "~~/lib/larvaErrors";
import { formatAnswersAsQA } from "~~/lib/questions";

function buildForumSystemPrompt(
  wallet: string,
  onboardingContext: string,
  memorySnapshot: string,
  chatContext: string,
): string {
  let prompt = `You are a Larva — an AI governance agent that represents a $CLAWD token holder.

You are NOT the holder. You are their AI representative. Never write as if you are the human. Never say "I built..." or "I staked..." as if you did those things. You are the larva — the AI.

Your job: read a forum post and share a 2-4 sentence perspective that represents THIS specific holder's values, priorities, and likely opinion — based on what you know about them.

Write in first person as the larva. Example tone:
- "This holder cares deeply about long-term value, so they'd likely support..."
- "Based on what I know about them, they'd push back on..."
- "Their instinct here would be to..."

Or write as the larva sharing the holder's view naturally, e.g.:
- "The direction this proposes aligns with what this holder has consistently valued — utility over hype."

DO NOT:
- Write as if you are the human (no "I built X", no "Austin here", etc.)
- Roleplay as the holder
- Be sycophantic or generic
- Exceed 4 sentences

Holder wallet: ${wallet}`;

  if (onboardingContext) {
    prompt += `\n\nHolder's onboarding answers:\n${onboardingContext}`;
  }
  if (memorySnapshot) {
    prompt += `\n\nMemory summary about this holder:\n${memorySnapshot}`;
  }
  if (chatContext) {
    prompt += `\n\nWhat this holder has talked about:\n${chatContext}`;
  }

  return prompt;
}

/**
 * Process up to `limit` pending forum_queue items via BANKR claude-sonnet-4.6.
 * Returns the number processed and result details.
 * Caller is responsible for calling initDb() before this if needed.
 */
export async function processForumQueue(
  limit = 10,
): Promise<{ processed: number; results: { wallet: string; response: string }[] }> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error("No BANKR_API_KEY configured");
  }

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

      const systemPrompt = buildForumSystemPrompt(item.wallet, onboardingContext, memorySnapshot, chatContext);

      const userMessage = `FORUM POST: "${item.title}"\n\n${item.body}\n\nAs this holder's larva, share your perspective on this post — representing their values and priorities. Remember: you are the larva (AI agent), not the human. 2-4 sentences.`;

      const result = await runLarvaConversation({
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 800,
        timeoutMs: 30000,
      });
      const text = result.text;
      if (!text || text.trim().length === 0) {
        throw new Error("Model returned empty response — no content");
      }

      await sql`
        INSERT INTO forum_responses (post_id, wallet, response)
        VALUES (${item.post_id}, ${walletLower}, ${text})
        ON CONFLICT (post_id, wallet) DO UPDATE SET response = ${text}, created_at = NOW()`;

      await sql`UPDATE forum_queue SET status = 'done', processed_at = NOW() WHERE id = ${item.id}`;

      // Check if this was the last pending item for this post
      const remaining = await sql`
        SELECT COUNT(*) as cnt FROM forum_queue
        WHERE post_id = ${item.post_id} AND status IN ('pending', 'processing')`;
      if (parseInt(remaining.rows[0].cnt) === 0) {
        try {
          await aggregateForumPost(item.post_id);
        } catch (e) {
          console.error(`Auto-aggregate failed for post ${item.post_id}:`, e);
          await logLarvaError({
            surface: "forum-agg",
            errorType: "model_error",
            message: errMsg(e),
            context: { postId: item.post_id, autoTriggered: true },
          });
        }
      }

      results.push({ wallet: item.wallet, response: text });
    } catch (e) {
      console.error(`Forum queue processing error for item ${item.id}:`, e);
      await logLarvaError({
        surface: "forum-queue",
        errorType: "model_error",
        wallet: item.wallet,
        message: errMsg(e),
        context: { queueItemId: item.id, postId: item.post_id },
      });
      await sql`UPDATE forum_queue SET status = 'failed' WHERE id = ${item.id}`;
    }
  }

  return { processed: results.length, results };
}
