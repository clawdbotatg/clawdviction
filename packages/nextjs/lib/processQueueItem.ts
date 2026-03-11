import { compressMemory, sql } from "~~/lib/db";
import { LARVA_BASE_PROMPT } from "~~/lib/larvaContext";
import { formatAnswersAsQA } from "~~/lib/questions";

export interface QueueItem {
  id: number;
  proposal_id: number;
  wallet: string;
  type: string;
  title: string;
  question: string;
  options: string[] | null;
}

export async function processQueueItem(item: QueueItem, apiKey: string): Promise<{ wallet: string; response: string }> {
  // Mark processing
  await sql`UPDATE governance_queue SET status = 'processing' WHERE id = ${item.id}`;

  // Normalise to lowercase for all DB lookups — tables may store mixed-case addresses
  const walletLower = item.wallet.toLowerCase();

  // If no memory snapshot exists yet, try to build one now before responding
  try {
    const snapCheck = await sql`SELECT snapshot FROM memory_snapshots WHERE LOWER(wallet) = ${walletLower}`;
    if (snapCheck.rows.length === 0 || !snapCheck.rows[0].snapshot) {
      await compressMemory(walletLower);
    }
  } catch {
    /* ignore — best effort */
  }

  // Fetch onboarding answers
  let onboardingContext = "";
  try {
    const seedResult = await sql`
      SELECT answers FROM larva_seeds WHERE LOWER(wallet) = ${walletLower} AND completed = true`;
    if (seedResult.rows.length > 0 && seedResult.rows[0].answers) {
      onboardingContext = formatAnswersAsQA(seedResult.rows[0].answers as Record<string, string>);
    }
  } catch {
    /* ignore */
  }

  // Fetch memory snapshot (may have just been created above)
  let memorySnapshot = "";
  try {
    const snapResult = await sql`
      SELECT snapshot FROM memory_snapshots WHERE LOWER(wallet) = ${walletLower}`;
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
      WHERE LOWER(wallet) = ${walletLower}
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

  let userMessage: string;
  if (item.type === "vote" && item.options && item.options.length > 0) {
    // Multi-option vote
    const optionLines = item.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    userMessage = `GOVERNANCE VOTE: "${item.title}"\n\nQuestion: ${item.question}\n\nOptions:\n${optionLines}\n\nBased on everything you know about this holder's values and preferences, respond with ONLY the option number (${item.options.map((_, i) => i + 1).join(", ")}) on the first line, then explain your reasoning on the following lines. Commit 100000 CV to this vote.`;
  } else if (item.type === "vote") {
    // Legacy yes/no/abstain vote (no options)
    userMessage = `GOVERNANCE VOTE: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, respond with ONLY "yes", "no", or "abstain" on the first line, then explain your reasoning on the following lines.`;
  } else {
    userMessage = `GOVERNANCE RFC: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, provide a thoughtful comment representing their perspective. Keep it to 2-4 sentences.`;
  }

  const baseUrl = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "zai-org-glm-5",
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
    }),
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  let responseText = text;
  let reasoning: string | null = null;
  let chosenOption: string | null = null;
  let cvCommitted: number | null = null;

  if (item.type === "vote" && item.options && item.options.length > 0) {
    // Multi-option vote: parse the chosen option number from the first line
    const lines = text.trim().split("\n");
    const firstLine = lines[0].trim();
    const match = firstLine.match(/(\d+)/);
    const optionNum = match ? parseInt(match[1]) : 0;

    if (optionNum >= 1 && optionNum <= item.options.length) {
      chosenOption = item.options[optionNum - 1];
    } else {
      chosenOption = item.options[0];
    }

    responseText = chosenOption;
    reasoning = lines.slice(1).join("\n").trim() || null;
    cvCommitted = 100000;
  } else if (item.type === "vote") {
    // Legacy yes/no/abstain vote
    const lines = text.trim().split("\n");
    const firstLine = lines[0].toLowerCase().trim();
    if (firstLine.includes("yes")) responseText = "yes";
    else if (firstLine.includes("abstain")) responseText = "abstain";
    else if (firstLine.includes("no")) responseText = "no";
    else responseText = "abstain";
    reasoning = lines.slice(1).join("\n").trim() || null;
  }

  // Store response — replace existing
  await sql`
    INSERT INTO governance_responses (proposal_id, wallet, response, reasoning, chosen_option, cv_committed)
    VALUES (${item.proposal_id}, ${walletLower}, ${responseText}, ${reasoning}, ${chosenOption}, ${cvCommitted})
    ON CONFLICT (proposal_id, wallet) DO UPDATE SET
      response = ${responseText}, reasoning = ${reasoning},
      chosen_option = ${chosenOption}, cv_committed = ${cvCommitted},
      created_at = NOW()`;

  await sql`UPDATE governance_queue SET status = 'done', processed_at = NOW() WHERE id = ${item.id}`;

  return { wallet: item.wallet, response: responseText };
}
