import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import { compressMemory, initDb, isDbAvailable, sql } from "~~/lib/db";
import { LARVA_BASE_PROMPT } from "~~/lib/larvaContext";
import { CHAT_MAX_LENGTH, formatAnswersAsQA } from "~~/lib/questions";
import { verifyAuth } from "~~/lib/verifyAuth";

const LARVA_SYSTEM_PROMPT = LARVA_BASE_PROMPT;

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

const ANTHROPIC_TOOLS = [
  {
    name: "get_clawd_token_stats",
    description: "Fetch live CLAWD token data including price (if available) and total staked CLAWD from on-chain.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_wallet_cv_score",
    description: "Look up a wallet's ClawdViction score, accrual rate, and balance.",
    input_schema: {
      type: "object" as const,
      properties: { wallet: { type: "string", description: "Ethereum address" } },
      required: ["wallet"],
    },
  },
  {
    name: "get_ecosystem_stats",
    description: "Get a snapshot of the CLAWD ecosystem: total staked, number of CV wallets, and other stats.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "fetch_url",
    description:
      "Fetch and read the content of a URL. Use this to look up live info from CLAWD ecosystem sites or any relevant URL. Returns page text content.",
    input_schema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "The URL to fetch" } },
      required: ["url"],
    },
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
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "ClawdViction-Larva/1.0 (+https://clawdbotatg.eth.link)" },
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

    return JSON.stringify({ error: "unknown tool" });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const verified = await verifyAuth(request);
    if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { wallet, message, messages: clientMessages } = await request.json();

    if (!wallet || !message) {
      return NextResponse.json({ error: "Missing wallet or message" }, { status: 400 });
    }

    if (typeof message !== "string" || message.length > CHAT_MAX_LENGTH) {
      return NextResponse.json({ error: `Message too long (max ${CHAT_MAX_LENGTH} characters)` }, { status: 400 });
    }

    if (verified !== wallet.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    await initDb();
    const dbOk = await isDbAvailable();

    let history: { role: string; content: string }[];
    let onboardingContext: string | null = null;

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

      // Save user message to DB
      await sql`
        INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'user', ${message})`;

      // Check for memory snapshot
      const snapshotResult = await sql`SELECT snapshot FROM memory_snapshots WHERE wallet = ${wallet}`;
      const snapshot = snapshotResult.rows[0]?.snapshot;

      // Load messages from DB
      const dbMessages = await sql`
        SELECT role, content FROM chat_messages
        WHERE wallet = ${wallet}
        ORDER BY created_at DESC
        LIMIT 30`;

      const rawMessages = dbMessages.rows.reverse() as { role: string; content: string }[];

      if (snapshot && rawMessages.length > 20) {
        // Snapshot + last 20 pattern
        const last20 = rawMessages.slice(-20);
        history = [
          { role: "user", content: `[Memory summary from previous conversations]: ${snapshot}` },
          { role: "assistant", content: "I remember our previous conversations. Let's continue! 🦞" },
          ...last20,
        ];
      } else {
        history = rawMessages;
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
        : "");

    // Gate: check CV balance BEFORE calling Haiku — don't burn an API call if they can't afford it
    if (dbOk) {
      const DIVISOR_PRE = 1_728_000n * 1_000_000_000_000_000_000n;
      const SEND_THRESHOLD_PRE = 1_000_000n;
      try {
        const cvPre =
          await sql`SELECT balance, accrual_rate, last_accrued_at FROM clawdviction_balances WHERE wallet = ${wallet.toLowerCase()}`;
        if (cvPre.rows.length > 0) {
          const r = cvPre.rows[0];
          const elapsed =
            BigInt(Math.floor(Date.now() / 1000)) - BigInt(Math.floor(new Date(r.last_accrued_at).getTime() / 1000));
          const materialized =
            BigInt(r.balance) + (BigInt(r.accrual_rate) * (elapsed > 0n ? elapsed : 0n)) / DIVISOR_PRE;
          if (materialized < SEND_THRESHOLD_PRE) {
            return NextResponse.json({ error: "Insufficient CV — need 1M to chat" }, { status: 402 });
          }
        }
      } catch (e) {
        console.error("CV pre-check error:", e);
      }
    }

    // Anthropic API call with tool use support
    const apiHeaders = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };

    const currentMessages = [...history];
    let assistantMessage = "🦞 *confused clicking*";

    // Tool use loop (max 3 rounds to prevent runaway)
    for (let round = 0; round < 3; round++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: round === 0 ? 200 : 400,
          system: systemPrompt,
          messages: currentMessages,
          tools: ANTHROPIC_TOOLS,
        }),
      });

      const data = await response.json();

      if (data.stop_reason === "tool_use") {
        // Add assistant message with tool_use blocks
        currentMessages.push({ role: "assistant", content: data.content });

        // Execute each tool call and build tool_result blocks
        const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
        for (const block of data.content) {
          if (block.type === "tool_use") {
            const result = await executeToolCall(block.name, block.input as Record<string, unknown>);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          }
        }
        currentMessages.push({ role: "user", content: toolResults as unknown as string });
        continue;
      }

      // Extract final text
      if (Array.isArray(data.content)) {
        const textBlock = data.content.find((b: { type: string }) => b.type === "text");
        if (textBlock) assistantMessage = textBlock.text;
      }
      break;
    }

    if (dbOk) {
      // Save assistant reply
      await sql`
        INSERT INTO chat_messages (wallet, role, content) VALUES (${wallet}, 'assistant', ${assistantMessage})`;

      // ClawdViction gate + deduction
      // Must have >= 1M CV to send; deducts 10K after a successful message
      const DIVISOR = 1_728_000n * 1_000_000_000_000_000_000n;
      const CHAT_COST = 10_000n;
      try {
        const cvRow = await sql`SELECT * FROM clawdviction_balances WHERE wallet = ${wallet.toLowerCase()}`;
        if (cvRow.rows.length > 0) {
          const row = cvRow.rows[0];
          const balance = BigInt(row.balance);
          const accrualRate = BigInt(row.accrual_rate);
          const lastAccrued = BigInt(Math.floor(new Date(row.last_accrued_at).getTime() / 1000));
          const nowSec = BigInt(Math.floor(Date.now() / 1000));
          const elapsed = nowSec - lastAccrued > 0n ? nowSec - lastAccrued : 0n;
          const pending = (accrualRate * elapsed) / DIVISOR;
          const materialized = balance + pending;

          const newBalance = materialized - CHAT_COST;
          const newTotalEarned = BigInt(row.total_earned) + pending;
          const newTotalSpent = BigInt(row.total_spent) + CHAT_COST;
          await sql`
            UPDATE clawdviction_balances SET
              balance = ${newBalance.toString()}::numeric,
              last_accrued_at = NOW(),
              total_earned = ${newTotalEarned.toString()}::numeric,
              total_spent = ${newTotalSpent.toString()}::numeric
            WHERE wallet = ${wallet.toLowerCase()}`;
        }
      } catch (e) {
        console.error("ClawdViction deduction error:", e);
      }

      // Fire-and-forget memory compression check
      const countResult = await sql`SELECT COUNT(*) as cnt FROM chat_messages WHERE wallet = ${wallet}`;
      const count = parseInt(countResult.rows[0].cnt);
      if (count >= 40 && count % 20 === 0) {
        compressMemory(wallet).catch(() => {});
      }
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
