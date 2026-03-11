import { NextRequest, NextResponse } from "next/server";
import { compressMemory, initDb, sql } from "~~/lib/db";
import { LARVA_BASE_PROMPT } from "~~/lib/larvaContext";
import { formatAnswersAsQA } from "~~/lib/questions";
import { verifyAuth } from "~~/lib/verifyAuth";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export async function POST(request: NextRequest) {
  try {
    const wallet = await verifyAuth(request);
    if (!wallet || wallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    await initDb();

    const pending = await sql`
      SELECT q.id, q.post_id, q.wallet, p.title, p.body
      FROM forum_queue q
      JOIN forum_posts p ON p.id = q.post_id
      WHERE q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT 10`;

    if (pending.rows.length === 0) {
      return NextResponse.json({ processed: 0, results: [] });
    }

    const results: { wallet: string; response: string }[] = [];
    const baseUrl = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";

    for (const item of pending.rows) {
      try {
        await sql`UPDATE forum_queue SET status = 'processing' WHERE id = ${item.id}`;

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

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("POST /api/forum/queue/process error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
