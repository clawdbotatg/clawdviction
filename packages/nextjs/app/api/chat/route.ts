import { NextRequest, NextResponse } from "next/server";
import * as dns from "node:dns/promises";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import { compressMemory, initDb, isDbAvailable, sql } from "~~/lib/db";
import { LarvaTool, runLarvaConversation } from "~~/lib/larvaAi";
import { LARVA_BASE_PROMPT } from "~~/lib/larvaContext";
import { errMsg, logLarvaError } from "~~/lib/larvaErrors";
import { CHAT_MAX_LENGTH, formatAnswersAsQA } from "~~/lib/questions";
import { verifyAuth } from "~~/lib/verifyAuth";

export const maxDuration = 60;

const LARVA_SYSTEM_PROMPT = LARVA_BASE_PROMPT;

// --- Issue #17: Cap assistant response length before DB insert ---
const MAX_ASSISTANT_LENGTH = 4000;
const MAX_TOOL_RESULT_LENGTH = 3000;

// Error response patterns — used to filter from history and prevent DB pollution
const ERROR_PATTERNS = ["🦞 *confused clicking*", "🦞 *clicks claws nervously*", "🦞 Something went wrong"];

// --- Issue #16: Per-wallet sliding-window rate limiting ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds
const RATE_LIMIT_MAX_REQUESTS = 10; // max requests per window
const rateLimitMap = new Map<string, number[]>(); // wallet -> timestamps

function checkRateLimit(wallet: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = rateLimitMap.get(wallet);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(wallet, timestamps);
  }
  // Evict old entries
  const filtered = timestamps.filter(t => t > cutoff);
  rateLimitMap.set(wallet, filtered);
  if (filtered.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // rate limited
  }
  filtered.push(now);
  return true; // allowed
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(
  () => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [wallet, timestamps] of rateLimitMap) {
      const filtered = timestamps.filter(t => t > cutoff);
      if (filtered.length === 0) {
        rateLimitMap.delete(wallet);
      } else {
        rateLimitMap.set(wallet, filtered);
      }
    }
  },
  5 * 60 * 1000,
);

const STAKING_CONTRACT = "0xC9E377FB98a1aA6Ecf4B553cE1b57940121213bf" as const;
const UNISWAP_POOL = "0xCD55381a53da35Ab1D7Bc5e3fE5F76cac976FAc3" as const;
const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;
const TOTAL_SUPPLY = 100_000_000_000; // 100B

const STAKING_ABI = [
  { name: "totalSupplyStaked", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const POOL_ABI = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

function getBaseClient() {
  return createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
  });
}

async function getTotalStaked(): Promise<string> {
  const client = getBaseClient();
  const raw = await client.readContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "totalSupplyStaked",
  });
  return formatUnits(raw, 18);
}

// WETH is token0, CLAWD is token1 in the Uniswap V3 pool.
// sqrtPriceX96^2 / 2^192 = token1/token0 = CLAWD per WETH
async function getClawdPriceUsd(): Promise<{ priceUsd: number; priceEth: number; ethPriceUsd: number } | null> {
  try {
    const client = getBaseClient();
    const [slot0, cgRes] = await Promise.all([
      client.readContract({ address: UNISWAP_POOL, abi: POOL_ABI, functionName: "slot0" }),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (!cgRes.ok) return null;
    const cgData = await cgRes.json();
    const ethPriceUsd: number = cgData.ethereum?.usd ?? 0;
    if (!ethPriceUsd) return null;

    const sqrtPriceX96 = Number(slot0[0]);
    const sqrtPriceNorm = sqrtPriceX96 / 2 ** 96;
    const clawdPerWeth = sqrtPriceNorm ** 2; // CLAWD per 1 WETH
    const priceEth = 1 / clawdPerWeth; // WETH per 1 CLAWD
    const priceUsd = priceEth * ethPriceUsd;

    return { priceUsd, priceEth, ethPriceUsd };
  } catch {
    return null;
  }
}

const LARVA_TOOLS: LarvaTool[] = [
  {
    name: "get_clawd_token_stats",
    description: "Fetch live CLAWD token data including price (if available) and total staked CLAWD from on-chain.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: args => executeToolCall("get_clawd_token_stats", args),
  },
  {
    name: "get_wallet_cv_score",
    description: "Look up a wallet's conviction (CV) score, accrual rate, and balance.",
    parameters: {
      type: "object",
      properties: { wallet: { type: "string", description: "Ethereum address" } },
      required: ["wallet"],
    },
    execute: args => executeToolCall("get_wallet_cv_score", args),
  },
  {
    name: "get_ecosystem_stats",
    description: "Get a snapshot of the CLAWD ecosystem: total staked, number of CV wallets, and other stats.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: args => executeToolCall("get_ecosystem_stats", args),
  },
  {
    name: "fetch_url",
    description:
      "Fetch and read the content of a URL. Use this to look up live info from CLAWD ecosystem sites or any relevant URL. Returns page text content.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "The URL to fetch" } },
      required: ["url"],
    },
    execute: args => executeToolCall("fetch_url", args),
  },
  {
    name: "get_governance_proposals",
    description:
      "Fetch all active governance proposals and RFCs on larv.ai. Use this when the holder asks what votes or RFCs are currently on the table, what governance is happening, or how their larva will vote.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: args => executeToolCall("get_governance_proposals", args),
  },
];

async function executeToolCall(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === "get_clawd_token_stats") {
      const results: Record<string, unknown> = {};
      // Live price from Uniswap V3 WETH/CLAWD pool on Base
      try {
        const price = await getClawdPriceUsd();
        if (price) {
          results.price_usd = price.priceUsd;
          results.price_eth = price.priceEth;
          results.eth_price_usd = price.ethPriceUsd;
          results.price_source = "Uniswap V3 WETH/CLAWD pool on Base (live)";
        } else {
          results.price_usd = "unavailable";
        }
      } catch (e) {
        results.price_usd = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
      // On-chain staked
      try {
        results.total_staked_clawd = await getTotalStaked();
      } catch (e) {
        results.total_staked_clawd = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
      // Burned supply — balance of 0xdead address
      try {
        const client = getBaseClient();
        const burned = await client.readContract({
          address: CLAWD_TOKEN,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [DEAD_ADDRESS],
        });
        const burnedFormatted = parseFloat(formatUnits(burned, 18));
        results.burned_clawd = burnedFormatted;
        results.total_supply = TOTAL_SUPPLY;
        results.circulating_supply = TOTAL_SUPPLY - burnedFormatted;
        results.pct_burned = ((burnedFormatted / TOTAL_SUPPLY) * 100).toFixed(2) + "%";
      } catch (e) {
        results.burned_clawd = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
      return JSON.stringify(results);
    }

    if (name === "get_wallet_cv_score") {
      const wallet = (input.wallet as string) || "";
      const res = await fetch(`http://localhost:3000/api/clawdviction/${wallet}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return JSON.stringify({ error: `API returned ${res.status}` });
      return JSON.stringify(await res.json());
    }

    if (name === "get_ecosystem_stats") {
      const results: Record<string, unknown> = {};
      try {
        results.total_staked_clawd = await getTotalStaked();
      } catch (e) {
        results.total_staked_clawd = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
      try {
        const walletCount = await sql`SELECT COUNT(*) as cnt FROM clawdviction_balances`;
        results.cv_wallet_count = parseInt(walletCount.rows[0].cnt);
      } catch {
        results.cv_wallet_count = "unavailable";
      }
      try {
        const msgCount = await sql`SELECT COUNT(DISTINCT wallet) as cnt FROM chat_messages`;
        results.active_chat_wallets = parseInt(msgCount.rows[0].cnt);
      } catch {
        results.active_chat_wallets = "unavailable";
      }
      try {
        const totalCV = await sql`SELECT SUM(balance::numeric) as total FROM clawdviction_balances`;
        results.total_cv_balance = totalCV.rows[0].total ?? "0";
      } catch {
        results.total_cv_balance = "unavailable";
      }
      return JSON.stringify(results);
    }

    if (name === "fetch_url") {
      const url = input.url as string;
      if (!url) return JSON.stringify({ error: "missing url" });

      // SSRF protection — block private/internal IPs at BOTH hostname AND resolved IP level
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return JSON.stringify({ error: "invalid url" });
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return JSON.stringify({ error: "invalid protocol" });
      }

      const isPrivateIP = (ip: string): boolean => {
        return (
          ip === "127.0.0.1" ||
          /^127\./.test(ip) ||
          /^10\./.test(ip) ||
          /^192\.168\./.test(ip) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
          /^169\.254\./.test(ip) ||
          ip === "::1" ||
          ip === "0.0.0.0" ||
          /^fc00:/i.test(ip) ||
          /^fe80:/i.test(ip) ||
          /^fd/i.test(ip)
        );
      };

      // Step 1: Block obvious hostname strings (fast path)
      const hostname = parsed.hostname;
      if (hostname === "localhost" || isPrivateIP(hostname)) {
        return JSON.stringify({ error: "private URLs not allowed" });
      }

      // Step 2: Resolve DNS and check the actual IP (defeats DNS rebinding)
      try {
        const { address } = await dns.lookup(hostname);
        if (isPrivateIP(address)) {
          return JSON.stringify({ error: "private URLs not allowed" });
        }
      } catch {
        return JSON.stringify({ error: "DNS resolution failed" });
      }

      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "LarvAI/1.0 (+https://larv.ai)" },
      });
      if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}` });
      let text = await res.text();
      // Strip HTML tags, scripts, styles
      text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
      text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
      text = text.replace(/<[^>]+>/g, " ");
      // Collapse whitespace
      text = text.replace(/\s+/g, " ").trim();
      // Truncate
      if (text.length > 3000) text = text.slice(0, 3000) + "…";
      return JSON.stringify({ url, content: text });
    }

    if (name === "get_governance_proposals") {
      const res = await fetch("https://larv.ai/api/gov", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return JSON.stringify({ error: `API returned ${res.status}` });
      const proposals = await res.json();
      // Shape it for the larva: id, type, title, question, status, response_count
      const summary = proposals.map((p: Record<string, unknown>) => ({
        id: p.id,
        type: p.type, // "vote" or "rfc"
        title: p.title,
        question: p.question,
        status: p.status,
        response_count: p.response_count,
        created_at: p.created_at,
      }));
      return JSON.stringify({ proposals: summary, count: summary.length });
    }

    return JSON.stringify({ error: "unknown tool" });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

export async function POST(request: NextRequest) {
  let walletForLog: string | null = null;
  try {
    const verified = await verifyAuth(request);
    if (!verified) {
      await logLarvaError({ surface: "chat", errorType: "auth", statusCode: 401, message: "verifyAuth failed" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { wallet: rawWallet, message, messages: clientMessages } = await request.json();

    if (!rawWallet || !message) {
      await logLarvaError({
        surface: "chat",
        errorType: "bad_request",
        wallet: verified,
        statusCode: 400,
        message: "missing wallet or message",
      });
      return NextResponse.json({ error: "Missing wallet or message" }, { status: 400 });
    }

    const wallet = rawWallet.toLowerCase();
    walletForLog = wallet;

    if (typeof message !== "string" || message.length > CHAT_MAX_LENGTH) {
      await logLarvaError({
        surface: "chat",
        errorType: "bad_request",
        wallet,
        statusCode: 400,
        message: `message too long: ${typeof message === "string" ? message.length : typeof message}`,
      });
      return NextResponse.json({ error: `Message too long (max ${CHAT_MAX_LENGTH} characters)` }, { status: 400 });
    }

    if (verified !== wallet) {
      await logLarvaError({
        surface: "chat",
        errorType: "auth",
        wallet,
        statusCode: 401,
        message: "signed wallet does not match body wallet",
        context: { signed: verified },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check — BEFORE CV deduction (#16)
    if (!checkRateLimit(wallet)) {
      await logLarvaError({ surface: "chat", errorType: "rate_limit", wallet, statusCode: 429 });
      return NextResponse.json({ error: "Rate limited — max 10 messages per minute. Slow down! 🦞" }, { status: 429 });
    }

    if (!process.env.BANKR_API_KEY) {
      await logLarvaError({
        surface: "chat",
        errorType: "config",
        wallet,
        statusCode: 500,
        message: "no BANKR_API_KEY",
      });
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    await initDb();
    const dbOk = await isDbAvailable();

    let history: { role: string; content: string }[];
    let onboardingContext: string | null = null;
    let snapshot: string | undefined;

    if (dbOk) {
      // Fetch raw onboarding answers and format as full Q&A
      try {
        const seedResult = await sql`
          SELECT answers FROM larva_seeds WHERE wallet = ${wallet} AND completed = true`;
        if (seedResult.rows.length > 0 && seedResult.rows[0].answers) {
          onboardingContext = formatAnswersAsQA(seedResult.rows[0].answers as Record<string, string>);
        }
      } catch {
        /* ignore */
      }

      // Check for memory snapshot
      const snapshotResult = await sql`SELECT snapshot FROM memory_snapshots WHERE wallet = ${wallet}`;
      snapshot = snapshotResult.rows[0]?.snapshot;

      // Load messages from DB
      const dbMessages = await sql`
        SELECT role, content FROM chat_messages
        WHERE wallet = ${wallet}
        ORDER BY created_at DESC
        LIMIT 30`;

      const rawMessages = dbMessages.rows.reverse() as { role: string; content: string }[];

      // Filter out error/fallback responses that poison the conversation context.
      // Remove assistant error messages AND the user message immediately before each one,
      // so the model doesn't see a chain of failed exchanges.
      const cleanMessages: { role: string; content: string }[] = [];
      for (let i = 0; i < rawMessages.length; i++) {
        const msg = rawMessages[i];
        if (msg.role === "assistant" && ERROR_PATTERNS.some(p => msg.content.startsWith(p))) {
          // Skip this error response AND remove the preceding user message if we just pushed one
          if (cleanMessages.length > 0 && cleanMessages[cleanMessages.length - 1].role === "user") {
            cleanMessages.pop();
          }
          continue;
        }
        cleanMessages.push(msg);
      }

      if (snapshot && cleanMessages.length > 20) {
        // Snapshot + last 20 pattern — use last 20 messages as recent context
        history = cleanMessages.slice(-20);
      } else {
        history = cleanMessages;
      }
    } else {
      // Fallback: use client-passed messages
      history =
        Array.isArray(clientMessages) && clientMessages.length > 0
          ? clientMessages
          : [{ role: "user", content: message }];
    }

    const systemPrompt =
      LARVA_SYSTEM_PROMPT(wallet) +
      (onboardingContext
        ? `\n\nThis holder completed their onboarding interview. Below are their exact answers — treat these as the foundation of your understanding of who they are:\n\n${onboardingContext}`
        : "") +
      (snapshot
        ? `\n\n## YOUR MEMORY OF THIS HOLDER\nThe following is your compressed memory from all previous conversations with this holder. This IS your memory — you learned all of this through past interactions. Reference it naturally, never say you "don't remember" things that are in here:\n\n${snapshot}`
        : "");

    // Gate + atomic deduction BEFORE calling Venice — prevents race condition exploits.
    // Materializes pending accrual then does a single atomic UPDATE that only succeeds
    // if the resulting balance stays >= 0. If no rows updated → insufficient CV.
    const DIVISOR = 1_728_000n * 1_000_000_000_000_000_000n;
    const CHAT_COST = 10_000n;
    const SEND_THRESHOLD = 1_000_000n;

    if (dbOk) {
      try {
        // Materialize pending accrual + deduct atomically in one statement.
        // FLOOR each accrual delta — the balance/total_earned columns have an
        // integer check constraint and (accrual_rate * elapsed) / DIVISOR
        // produces fractional numerics. Per-call truncation loses < 1 unit.
        const deducted = await sql`
          UPDATE clawdviction_balances
          SET
            balance = balance
              + FLOOR((accrual_rate * EXTRACT(EPOCH FROM (NOW() - last_accrued_at))::bigint) / ${DIVISOR.toString()}::numeric)
              - ${CHAT_COST.toString()}::numeric,
            total_spent = total_spent + ${CHAT_COST.toString()}::numeric,
            total_earned = total_earned
              + FLOOR((accrual_rate * EXTRACT(EPOCH FROM (NOW() - last_accrued_at))::bigint) / ${DIVISOR.toString()}::numeric),
            last_accrued_at = NOW()
          WHERE wallet = ${wallet.toLowerCase()}
            AND (
              balance
              + FLOOR((accrual_rate * GREATEST(EXTRACT(EPOCH FROM (NOW() - last_accrued_at))::bigint, 0)) / ${DIVISOR.toString()}::numeric)
            ) >= ${SEND_THRESHOLD.toString()}::numeric
          RETURNING balance`;

        if (deducted.rows.length === 0) {
          // Either wallet not found or insufficient CV — either way, reject
          await logLarvaError({ surface: "chat", errorType: "insufficient_cv", wallet, statusCode: 402 });
          return NextResponse.json({ error: "Insufficient CV — need 1M to chat" }, { status: 402 });
        }
      } catch (e) {
        console.error("CV atomic deduction error:", e);
        await logLarvaError({
          surface: "chat",
          errorType: "db_error",
          wallet,
          message: `CV deduction: ${errMsg(e)}`,
        });
        // Fail open — the user message INSERT below (outside this try/catch) handles saving
      }

      // CV deducted — now safe to save the user message (outside try/catch so errors surface)
      // Dedupe: skip if the same wallet+content was inserted in the last 5 seconds (double-submit guard)
      if (dbOk) {
        try {
          const recent = await sql`
            SELECT id FROM chat_messages
            WHERE wallet = ${wallet} AND role = 'user' AND content = ${message}
              AND created_at > NOW() - INTERVAL '5 seconds'
            LIMIT 1`;
          if (recent.rows.length === 0) {
            await sql`INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'user', ${message})`;
          }
        } catch (e) {
          console.error("User message INSERT failed:", e);
        }
      }
    }

    // Truncate very long individual messages to keep context manageable
    const MAX_MSG_CHARS = 1500;
    const trimmedHistory = history.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content.length > MAX_MSG_CHARS ? m.content.slice(0, MAX_MSG_CHARS) + "… [truncated]" : m.content,
    }));

    let assistantMessage = "🦞 *confused clicking*";
    const cvDeducted = true; // CV was already deducted above

    try {
      const result = await runLarvaConversation({
        system: systemPrompt,
        messages: [...trimmedHistory, { role: "user", content: message }],
        tools: LARVA_TOOLS,
        maxTokens: 2000,
        maxToolRounds: 3,
        maxToolResultLength: MAX_TOOL_RESULT_LENGTH,
        timeoutMs: 25000,
      });

      if (result.text && result.text.trim()) {
        assistantMessage = result.text;
      } else {
        console.error("Larva: empty content from", result.provider);
        await logLarvaError({
          surface: "chat",
          errorType: "model_empty",
          wallet,
          context: { provider: result.provider },
        });
        assistantMessage = "🦞 *clicks claws nervously* — try again?";
      }
    } catch (e) {
      console.error("Larva model error:", e instanceof Error ? e.message : e);
      await logLarvaError({ surface: "chat", errorType: "model_error", wallet, message: errMsg(e) });
      assistantMessage = "🦞 Something went wrong on my end. Try again soon.";
    }

    // Don't save error/fallback responses to DB — they poison future conversation context
    const isErrorResponse = ERROR_PATTERNS.some(p => assistantMessage.startsWith(p));

    // Refund CV on error — give back what was deducted
    if (dbOk && isErrorResponse && cvDeducted) {
      try {
        await sql`
          UPDATE clawdviction_balances
          SET balance = balance + 10000,
              total_spent = total_spent - 10000
          WHERE wallet = ${wallet.toLowerCase()}`;
      } catch (e) {
        console.error("CV refund error:", e);
      }
    }

    if (dbOk && !isErrorResponse) {
      // Cap assistant response length before DB insert (#17)
      const dbAssistantMessage =
        assistantMessage.length > MAX_ASSISTANT_LENGTH
          ? assistantMessage.slice(0, MAX_ASSISTANT_LENGTH) + "… [truncated]"
          : assistantMessage;

      // Save assistant reply
      await sql`
        INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'assistant', ${dbAssistantMessage})`;

      // Fire-and-forget memory compression check
      // Compress when: 40+ messages AND (no snapshot exists OR snapshot is 20+ messages stale)
      const countResult = await sql`SELECT COUNT(*) as cnt FROM chat_messages WHERE wallet = ${wallet}`;
      const count = parseInt(countResult.rows[0].cnt);
      if (count >= 40) {
        const snapResult = await sql`SELECT message_count FROM memory_snapshots WHERE wallet = ${wallet}`;
        const lastSnapCount = snapResult.rows[0]?.message_count ?? 0;
        if (lastSnapCount === 0 || count - lastSnapCount >= 20) {
          compressMemory(wallet).catch(() => {});
        }
      }
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Chat error:", error);
    await logLarvaError({
      surface: "chat",
      errorType: "internal",
      wallet: walletForLog,
      statusCode: 500,
      message: errMsg(error),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
