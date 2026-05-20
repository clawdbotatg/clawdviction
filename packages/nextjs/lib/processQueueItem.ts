import { compressMemory, sql } from "~~/lib/db";
import { runLarvaConversation } from "~~/lib/larvaAi";
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

export async function processQueueItem(item: QueueItem): Promise<{ wallet: string; response: string }> {
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

  const isGovernanceVote = item.type === "vote";
  const systemPrompt =
    LARVA_BASE_PROMPT(item.wallet, { isGovernanceVote }) +
    (onboardingContext ? `\n\nHolder's onboarding answers:\n${onboardingContext}` : "") +
    (memorySnapshot ? `\n\nMemory summary from previous conversations:\n${memorySnapshot}` : "") +
    (chatContext ? `\n\nRecent chat history:\n${chatContext}` : "");

  let userMessage: string;
  if (item.type === "vote" && item.options && item.options.length > 0) {
    // Multi-option vote
    const optionLines = item.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    userMessage = `GOVERNANCE VOTE: "${item.title}"\n\nQuestion: ${item.question}\n\nVote Options:\n${optionLines}\n\nYou are voting on behalf of this holder based on everything you know about their values and preferences.\n\nFirst, explain your reasoning in 2-3 sentences. Then on the final line, write: VOTE: [number]\n\nExample final line: VOTE: 3`;
  } else if (item.type === "vote") {
    // Legacy yes/no/abstain vote (no options)
    userMessage = `GOVERNANCE VOTE: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, respond with ONLY "yes", "no", or "abstain" on the first line, then explain your reasoning on the following lines.`;
  } else {
    userMessage = `GOVERNANCE RFC: "${item.title}"\n\nQuestion: ${item.question}\n\nBased on everything you know about this holder's values and preferences, provide a thoughtful comment representing their perspective. Keep it to 2-4 sentences.`;
  }

  if (!process.env.VENICE_API_KEY) {
    throw new Error("No VENICE_API_KEY configured");
  }

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

  let responseText = text;
  let reasoning: string | null = null;
  let chosenOption: string | null = null;
  let cvCommitted: number | null = null;

  if (item.type === "vote" && item.options && item.options.length > 0) {
    // Multi-option vote: look for VOTE: N pattern anywhere in response
    const voteMatch = text.match(/VOTE:\s*(\d+)/i);
    let optionNum = 0;

    if (voteMatch) {
      optionNum = parseInt(voteMatch[1]);
      // Extract reasoning: everything before the VOTE line
      const voteLineIdx = text.lastIndexOf(voteMatch[0]);
      reasoning = text.slice(0, voteLineIdx).trim() || null;
    } else {
      // Fallback: find any standalone digit 1-N
      const digitPattern = new RegExp(`\\b([1-${item.options.length}])\\b`);
      const digitMatch = text.match(digitPattern);
      if (digitMatch) {
        optionNum = parseInt(digitMatch[1]);
      }
      reasoning = text.trim() || null;
    }

    if (optionNum >= 1 && optionNum <= item.options.length) {
      chosenOption = item.options[optionNum - 1];
    } else {
      chosenOption = item.options[0];
    }

    responseText = chosenOption;
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
