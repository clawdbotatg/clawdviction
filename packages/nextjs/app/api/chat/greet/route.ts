import { NextRequest, NextResponse } from "next/server";
import { initDb, isDbAvailable, sql } from "~~/lib/db";
import { LARVA_GREET_PROMPT } from "~~/lib/larvaContext";
import { errMsg, logLarvaError } from "~~/lib/larvaErrors";
import { formatAnswersAsQA } from "~~/lib/questions";
import { verifyAuth } from "~~/lib/verifyAuth";

const GREET_SYSTEM = LARVA_GREET_PROMPT;

export async function POST(request: NextRequest) {
  let walletForLog: string | null = null;
  try {
    const verified = await verifyAuth(request);
    if (!verified) {
      await logLarvaError({ surface: "greet", errorType: "auth", statusCode: 401 });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { wallet: rawWallet } = await request.json();
    if (!rawWallet) {
      await logLarvaError({ surface: "greet", errorType: "bad_request", wallet: verified, statusCode: 400 });
      return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    }

    const wallet = rawWallet.toLowerCase();
    walletForLog = wallet;

    if (verified !== wallet) {
      await logLarvaError({
        surface: "greet",
        errorType: "auth",
        wallet,
        statusCode: 401,
        context: { signed: verified },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.VENICE_API_KEY;
    const baseUrl = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
    if (!apiKey) {
      await logLarvaError({ surface: "greet", errorType: "config", wallet, statusCode: 500 });
      return NextResponse.json({ error: "No API key" }, { status: 500 });
    }

    await initDb();
    const dbOk = await isDbAvailable();

    // Don't double-greet if chat history already exists
    if (dbOk) {
      const existing = await sql`SELECT id FROM chat_messages WHERE wallet = ${wallet} LIMIT 1`;
      if (existing.rows.length > 0) return NextResponse.json({ message: null });
    }

    // Fetch raw onboarding answers and format as full Q&A
    let onboardingContext: string | null = null;
    if (dbOk) {
      try {
        const row = await sql`SELECT answers FROM larva_seeds WHERE wallet = ${wallet} AND completed = true`;
        if (row.rows[0]?.answers) {
          onboardingContext = formatAnswersAsQA(row.rows[0].answers as Record<string, string>);
        }
      } catch {
        /* ignore */
      }
    }

    const systemPrompt =
      GREET_SYSTEM(wallet) +
      (onboardingContext ? `\n\nHolder onboarding — their exact answers:\n\n${onboardingContext}` : "");

    const res = await fetch(`${baseUrl}/chat/completions`, {
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
          { role: "user", content: "Please greet the holder." },
        ],
        venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
      }),
    });

    const data = await res.json();
    const rawGreeting = data.choices?.[0]?.message?.content;
    const greeting = rawGreeting || "Hey 🦞 Good to meet you.";

    if (!rawGreeting) {
      await logLarvaError({
        surface: "greet",
        errorType: "model_empty",
        wallet,
        context: { provider: "venice", model: "zai-org-glm-5", finish: data.choices?.[0]?.finish_reason },
      });
    }
    if (!res.ok) {
      await logLarvaError({
        surface: "greet",
        errorType: "model_error",
        wallet,
        statusCode: res.status,
        message: `Venice HTTP ${res.status}`,
      });
    }

    if (dbOk) {
      await sql`INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'assistant', ${greeting})`;
    }

    return NextResponse.json({ message: greeting });
  } catch (err) {
    console.error("Greet error:", err);
    await logLarvaError({
      surface: "greet",
      errorType: "internal",
      wallet: walletForLog,
      statusCode: 500,
      message: errMsg(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
