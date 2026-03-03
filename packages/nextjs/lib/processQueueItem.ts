import { sql } from "~~/lib/db";
import { LARVA_BASE_PROMPT } from "~~/lib/larvaContext";
import { formatAnswersAsQA } from "~~/lib/questions";

export interface QueueItem {
  id: number;
  proposal_id: number;
  wallet: string;
  type: string;
  title: string;
  question: string;
}

export async function processQueueItem(item: QueueItem, apiKey: string): Promise<{ wallet: string; response: string }> {
  // Mark processing
  await sql`UPDATE governance_queue SET status = 'processing' WHERE id = ${item.id}`;

  // Fetch onboarding answers
  let onboardingContext = "";
  try {
    const seedResult = await sql`
      SELECT answers FROM larva_seeds WHERE wallet = ${item.wallet} AND completed = true`;
    if (seedResult.rows.length > 0 && seedResult.rows[0].answers) {
      onboardingContext = formatAnswersAsQA(seedResult.rows[0].answers as Record<string, string>);
    }
  } catch {
    /* ignore */
  }

  // Fetch memory snapshot
  let memorySnapshot = "";
  try {
    const snapResult = await sql`
      SELECT snapshot FROM memory_snapshots WHERE wallet = ${item.wallet}`;
    if (snapResult.rows.length > 0 && snapResult.rows[0].snapshot) {
      memorySnapshot = snapResult.rows[0].snapshot as string;
    }
  } catch {
    /* ignore */
  }

  // Fetch recent chat history
  let chatContext = "";
  try {
    const chatResult = await sql`
      SELECT role, content FROM chat_messages
      WHERE wallet = ${item.wallet}
      ORDER BY created_at DESC LIMIT 30`;
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

  const userMessage =
    item.type === "vote"
      ? `GOVERNANCE VOTE: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, respond with ONLY "yes", "no", or "abstain" on the first line, then explain your reasoning on the following lines.`
      : `GOVERNANCE RFC: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, provide a thoughtful comment representing their perspective. Keep it to 2-4 sentences.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  let responseText = text;
  let reasoning: string | null = null;

  if (item.type === "vote") {
    const lines = text.trim().split("\n");
    const firstLine = lines[0].toLowerCase().trim();
    if (firstLine.includes("yes")) responseText = "yes";
    else if (firstLine.includes("abstain")) responseText = "abstain";
    else if (firstLine.includes("no")) responseText = "no";
    else responseText = "abstain";
    reasoning = lines.slice(1).join("\n").trim() || null;
  }

  // Store response
  await sql`
    INSERT INTO governance_responses (proposal_id, wallet, response, reasoning)
    VALUES (${item.proposal_id}, ${item.wallet}, ${responseText}, ${reasoning})
    ON CONFLICT (proposal_id, wallet) DO UPDATE SET
      response = ${responseText}, reasoning = ${reasoning}`;

  await sql`UPDATE governance_queue SET status = 'done', processed_at = NOW() WHERE id = ${item.id}`;

  return { wallet: item.wallet, response: responseText };
}
