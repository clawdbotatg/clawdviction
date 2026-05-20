import { compressMemory, initDb, sql } from "~~/lib/db";
import { aggregateLabsIdea } from "~~/lib/labsAggregate";
import { runLarvaConversation } from "~~/lib/larvaAi";
import { errMsg, logLarvaError } from "~~/lib/larvaErrors";
import { formatAnswersAsQA } from "~~/lib/questions";

function buildLabsSystemPrompt(
  wallet: string,
  onboardingContext: string,
  memorySnapshot: string,
  chatContext: string,
): string {
  let prompt = `You are a Larva — an AI governance agent that represents a $CLAWD token holder.

You are NOT the holder. You are their AI representative. Never write as if you are the human. Never say "I built..." or "I staked..." as if you did those things. You are the larva — the AI.

Your job: review a build idea and share a 2-4 sentence perspective that represents THIS specific holder's values, priorities, and likely opinion — based on what you know about them.

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

export async function processLabsQueue(
  limit = 10,
): Promise<{ processed: number; results: { wallet: string; response: string }[] }> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error("No BANKR_API_KEY configured");
  }

  await initDb();

  const claimed = await sql`
    UPDATE labs_queue
    SET status = 'processing'
    WHERE id IN (
      SELECT id FROM labs_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, idea_id, wallet`;

  if (claimed.rows.length === 0) {
    return { processed: 0, results: [] };
  }

  const pending: { rows: { id: number; idea_id: number; wallet: string; title: string; description: string }[] } = {
    rows: [],
  };
  for (const row of claimed.rows) {
    const idea = await sql`SELECT title, description FROM labs_ideas WHERE id = ${row.idea_id}`;
    pending.rows.push({
      id: row.id,
      idea_id: row.idea_id,
      wallet: row.wallet,
      title: idea.rows[0]?.title || "",
      description: idea.rows[0]?.description || "",
    });
  }

  const results: { wallet: string; response: string }[] = [];

  for (const item of pending.rows) {
    try {
      const walletLower = item.wallet.toLowerCase();

      try {
        const snapCheck = await sql`SELECT snapshot FROM memory_snapshots WHERE LOWER(wallet) = ${walletLower}`;
        if (snapCheck.rows.length === 0 || !snapCheck.rows[0].snapshot) {
          await compressMemory(walletLower);
        }
      } catch {
        /* best effort */
      }

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

      const systemPrompt = buildLabsSystemPrompt(item.wallet, onboardingContext, memorySnapshot, chatContext);

      const userMessage = `BUILD IDEA: "${item.title}"\n\n${item.description}\n\nAs this holder's larva, share your perspective on this build idea — representing their values and priorities. Remember: you are the larva (AI agent), not the human. 2-4 sentences.`;

      const result = await runLarvaConversation({
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 800,
      });
      const text = result.text;

      await sql`
        INSERT INTO labs_responses (idea_id, wallet, response)
        VALUES (${item.idea_id}, ${walletLower}, ${text})
        ON CONFLICT (idea_id, wallet) DO UPDATE SET response = ${text}, created_at = NOW()`;

      await sql`UPDATE labs_queue SET status = 'done', processed_at = NOW() WHERE id = ${item.id}`;

      const remaining = await sql`
        SELECT COUNT(*) as cnt FROM labs_queue
        WHERE idea_id = ${item.idea_id} AND status IN ('pending', 'processing')`;
      if (parseInt(remaining.rows[0].cnt) === 0) {
        try {
          await aggregateLabsIdea(item.idea_id);
        } catch (e) {
          console.error(`Auto-aggregate failed for idea ${item.idea_id}:`, e);
          await logLarvaError({
            surface: "labs-agg",
            errorType: "model_error",
            message: errMsg(e),
            context: { ideaId: item.idea_id, autoTriggered: true },
          });
        }
      }

      results.push({ wallet: item.wallet, response: text });
    } catch (e) {
      console.error(`Labs queue processing error for item ${item.id}:`, e);
      await logLarvaError({
        surface: "labs-queue",
        errorType: "model_error",
        wallet: item.wallet,
        message: errMsg(e),
        context: { queueItemId: item.id, ideaId: item.idea_id },
      });
      await sql`UPDATE labs_queue SET status = 'failed' WHERE id = ${item.id}`;
    }
  }

  return { processed: results.length, results };
}
