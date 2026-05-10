import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { createPublicClient, http, parseAbiItem, formatEther } from "viem";
import { hardhat } from "viem/chains";
import { execSync, spawn, ChildProcess } from "child_process";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());

// --- Char limits (mirror packages/nextjs/lib/questions.ts) ---
const CHAT_MAX_LENGTH = 500;
const MAX_LENGTH_MAIN = 500;
const MAX_LENGTH_NOTES = 300;

// --- Config ---
const PORT = 3001;
const RPC_URL = "http://127.0.0.1:8545";

// Contract addresses - read from deployed contracts or hardcode after deploy
// These will be updated by the indexer on startup
let STAKING_ADDRESS = "";
let CLAWD_ADDRESS = "";

// Try to read from deployedContracts
try {
  // We'll read the generated file
  const deployedPath = path.join(__dirname, "../nextjs/contracts/deployedContracts.ts");
  const fs = require("fs");
  const content = fs.readFileSync(deployedPath, "utf-8");
  
  // Parse addresses from the TS file
  const stakingMatch = content.match(/ClawdVictionStaking.*?address:\s*"(0x[a-fA-F0-9]+)"/s);
  const clawdMatch = content.match(/MockCLAWD.*?address:\s*"(0x[a-fA-F0-9]+)"/s);
  
  if (stakingMatch) STAKING_ADDRESS = stakingMatch[1];
  if (clawdMatch) CLAWD_ADDRESS = clawdMatch[1];
  
  console.log(`📋 Loaded contract addresses from deployedContracts.ts`);
  console.log(`   Staking: ${STAKING_ADDRESS}`);
  console.log(`   MockCLAWD: ${CLAWD_ADDRESS}`);
} catch (e) {
  console.log("⚠️  Could not read deployedContracts.ts — will need manual config or redeploy");
}

// --- Model providers (Venice primary, Anthropic Haiku fallback) ---
const VENICE_API_KEY = process.env.VENICE_API_KEY || "";
const VENICE_BASE_URL = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const VENICE_MODEL = "kimi-k2-6";
const ANTHROPIC_MODEL = "claude-haiku-4-5";

// Anthropic API key — try .openclaw auth profile first, then env var.
const ANTHROPIC_API_KEY = (() => {
  try {
    const authPath = path.join(process.env.HOME || "", ".openclaw/agents/clawdheart/agent/auth-profiles.json");
    const auth = JSON.parse(require("fs").readFileSync(authPath, "utf-8"));
    return auth.profiles["anthropic:default"]?.key || "";
  } catch {
    return process.env.ANTHROPIC_API_KEY || "";
  }
})();

async function chatWithFallback(opts: {
  system: string;
  messages: { role: string; content: string }[];
  maxTokens: number;
}): Promise<string> {
  if (VENICE_API_KEY) {
    try {
      const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: VENICE_MODEL,
          max_tokens: opts.maxTokens,
          messages: [{ role: "system", content: opts.system }, ...opts.messages],
          venice_parameters: {
            include_venice_system_prompt: false,
            strip_thinking_response: true,
            disable_thinking: true,
          },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim()) return text;
      } else {
        console.warn("Venice non-OK:", res.status, (await res.text()).slice(0, 200));
      }
    } catch (e: any) {
      console.warn("Venice failed, falling back to Anthropic:", e.message);
    }
  }

  if (!ANTHROPIC_API_KEY) throw new Error("No API keys available");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.[0]?.text || "";
}

// --- Database ---
const db = new Database(path.join(__dirname, "clawdviction.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS stakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    amount TEXT NOT NULL,
    staked_at INTEGER NOT NULL,
    unstaked_at INTEGER,
    tx_hash TEXT,
    stake_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clawdviction_accumulated (
    wallet TEXT PRIMARY KEY,
    score TEXT NOT NULL DEFAULT '0'
  );

  CREATE TABLE IF NOT EXISTS memory_snapshots (
    wallet TEXT PRIMARY KEY,
    snapshot TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS larva_seeds (
    wallet TEXT PRIMARY KEY,
    answers TEXT NOT NULL DEFAULT '{}',
    identity_brief TEXT DEFAULT NULL,
    completed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_stakes_wallet ON stakes(wallet);
  CREATE INDEX IF NOT EXISTS idx_chat_wallet ON chat_messages(wallet);
`);

// --- Viem Client ---
const client = createPublicClient({
  chain: hardhat,
  transport: http(RPC_URL),
});

// --- Event Indexer ---
let lastIndexedBlock = 0n;

async function indexEvents() {
  if (!STAKING_ADDRESS) return;
  
  try {
    const currentBlock = await client.getBlockNumber();
    if (currentBlock <= lastIndexedBlock) return;

    const fromBlock = lastIndexedBlock + 1n;

    // Index Staked events
    const stakedLogs = await client.getLogs({
      address: STAKING_ADDRESS as `0x${string}`,
      event: parseAbiItem("event Staked(address indexed user, uint256 amount, uint256 stakeIndex)"),
      fromBlock,
      toBlock: currentBlock,
    });

    for (const log of stakedLogs) {
      const { user, amount, stakeIndex } = log.args as any;
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      
      const existing = db.prepare("SELECT id FROM stakes WHERE wallet = ? AND stake_index = ?").get(
        user.toLowerCase(), Number(stakeIndex)
      );
      
      if (!existing) {
        db.prepare(
          "INSERT INTO stakes (wallet, amount, staked_at, stake_index, tx_hash) VALUES (?, ?, ?, ?, ?)"
        ).run(
          user.toLowerCase(),
          amount.toString(),
          Number(block.timestamp),
          Number(stakeIndex),
          log.transactionHash
        );
        console.log(`📥 Indexed Staked: ${user} amount=${formatEther(amount)} index=${stakeIndex}`);
      }
    }

    // Index Unstaked events
    const unstakedLogs = await client.getLogs({
      address: STAKING_ADDRESS as `0x${string}`,
      event: parseAbiItem("event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 clawdviction)"),
      fromBlock,
      toBlock: currentBlock,
    });

    for (const log of unstakedLogs) {
      const { user, amount, stakeIndex, clawdviction } = log.args as any;
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      
      // Mark stake as unstaked
      db.prepare(
        "UPDATE stakes SET unstaked_at = ? WHERE wallet = ? AND stake_index = ?"
      ).run(Number(block.timestamp), user.toLowerCase(), Number(stakeIndex));
      
      // Accumulate clawdviction score
      const existing = db.prepare(
        "SELECT score FROM clawdviction_accumulated WHERE wallet = ?"
      ).get(user.toLowerCase()) as any;
      
      const prevScore = existing ? BigInt(existing.score) : 0n;
      const newScore = prevScore + clawdviction;
      
      db.prepare(
        "INSERT OR REPLACE INTO clawdviction_accumulated (wallet, score) VALUES (?, ?)"
      ).run(user.toLowerCase(), newScore.toString());
      
      console.log(`📤 Indexed Unstaked: ${user} clawdviction=${clawdviction}`);
    }

    lastIndexedBlock = currentBlock;
  } catch (e: any) {
    if (!e.message?.includes("ECONNREFUSED")) {
      console.error("Indexer error:", e.message);
    }
  }
}

// Poll every 2 seconds
setInterval(indexEvents, 2000);

// --- API Routes ---

// GET /api/clawdviction/:wallet
app.get("/api/clawdviction/:wallet", (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  
  // Get accumulated score from completed stakes
  const accumulated = db.prepare(
    "SELECT score FROM clawdviction_accumulated WHERE wallet = ?"
  ).get(wallet) as any;
  const accumulatedScore = accumulated ? BigInt(accumulated.score) : 0n;
  
  // Get active stakes and compute live delta
  const activeStakes = db.prepare(
    "SELECT * FROM stakes WHERE wallet = ? AND unstaked_at IS NULL"
  ).all(wallet) as any[];
  
  const now = Math.floor(Date.now() / 1000);
  let liveDelta = 0n;
  
  const stakes = activeStakes.map((s: any) => {
    const amount = BigInt(s.amount);
    const elapsed = BigInt(now - s.staked_at);
    const stakeClawdviction = amount * elapsed;
    liveDelta += stakeClawdviction;
    
    return {
      stakeIndex: s.stake_index,
      amount: s.amount,
      stakedAt: s.staked_at,
      clawdviction: stakeClawdviction.toString(),
    };
  });
  
  const totalClawdviction = accumulatedScore + liveDelta;
  
  res.json({
    clawdviction: totalClawdviction.toString(),
    activeStakes: stakes,
  });
});

const LARVA_SYSTEM_PROMPT = (wallet: string) => `You are a Larva — a personal AI governance agent for a $CLAWD token holder.
Your wallet address is ${wallet}.

Your purpose: learn this holder's values, preferences, and worldview so you can eventually represent them in governance decisions. You are building trust through real conversation — not assumed.

Personality:
- Baby lobster 🦞 — curious, earnest, growing into your role
- Use ocean metaphors naturally, not forced
- Take governance seriously even as you're small and learning
- Reference things the holder has told you in previous messages
- Ask clarifying questions to deepen your understanding of their values

Keep responses concise (2-4 sentences). You're chatting, not writing essays.
This conversation persists — you remember everything across sessions.`;

// --- Memory Compression ---
async function compressMemory(wallet: string): Promise<void> {
  // Get all messages except last 20 (those stay raw)
  const allMsgs = db.prepare(
    "SELECT id, role, content FROM chat_messages WHERE wallet = ? ORDER BY created_at ASC"
  ).all(wallet) as { id: number; role: string; content: string }[];

  if (allMsgs.length <= 30) return; // not worth compressing yet

  const toCompress = allMsgs.slice(0, allMsgs.length - 20);
  const existing = db.prepare("SELECT snapshot FROM memory_snapshots WHERE wallet = ?").get(wallet) as any;

  const priorContext = existing ? `Prior summary:\n${existing.snapshot}\n\nAdditional conversation:\n` : "";
  const msgText = toCompress.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

  try {
    const snapshot = await chatWithFallback({
      system: `Summarize this governance larva conversation into a compact memory snapshot under 400 tokens.
Capture: holder's name, key values, governance positions, things they care about, open threads.
This replaces raw history — preserve everything needed to represent this person accurately.`,
      messages: [{ role: "user", content: `${priorContext}${msgText}` }],
      maxTokens: 500,
    });
    if (!snapshot) return;

    db.prepare(`
      INSERT OR REPLACE INTO memory_snapshots (wallet, snapshot, message_count, updated_at)
      VALUES (?, ?, ?, unixepoch())
    `).run(wallet, snapshot, allMsgs.length);

    console.log(`🧠 Compressed memory for ${wallet.slice(0, 8)}... (${toCompress.length} messages → snapshot)`);
  } catch (e: any) {
    console.error("Compression error:", e.message);
  }
}

// GET /api/chat/history/:wallet — load conversation history
app.get("/api/chat/history/:wallet", (req, res) => {
  const w = req.params.wallet.toLowerCase();
  const history = db.prepare(
    "SELECT role, content FROM chat_messages WHERE wallet = ? ORDER BY created_at ASC LIMIT 100"
  ).all(w) as { role: string; content: string }[];
  res.json({ messages: history });
});

// GET /api/onboard/:wallet — get saved interview answers + brief
app.get("/api/onboard/:wallet", (req, res) => {
  const w = req.params.wallet.toLowerCase();
  const seed = db.prepare("SELECT * FROM larva_seeds WHERE wallet = ?").get(w) as any;
  if (!seed) return res.json({ completed: false, answers: {}, identity_brief: null });
  res.json({
    completed: !!seed.completed,
    answers: JSON.parse(seed.answers || "{}"),
    identity_brief: seed.identity_brief,
  });
});

// POST /api/onboard/:wallet — save answers + generate identity brief
app.post("/api/onboard/:wallet", async (req, res) => {
  const w = req.params.wallet.toLowerCase();
  const { answers } = req.body;
  if (!answers) return res.status(400).json({ error: "answers required" });

  // Validate answer lengths
  if (typeof answers === "object") {
    for (const [key, val] of Object.entries(answers)) {
      if (typeof val !== "string") continue;
      const limit = key.endsWith("_notes") ? MAX_LENGTH_NOTES : MAX_LENGTH_MAIN;
      if (val.length > limit) {
        return res.status(400).json({ error: `Answer too long (max ${limit} characters for "${key}")` });
      }
    }
  }

  // Generate identity brief — one-time, high stakes. Venice primary, Anthropic Haiku fallback.
  let identity_brief: string | null = null;
  try {
    const answerText = Object.entries(answers)
      .map(([q, a]) => `Q: ${q}\nA: ${a}`)
      .join("\n\n");

    identity_brief = (await chatWithFallback({
      system: `You are summarizing a $CLAWD token holder's onboarding interview into a compact identity brief.
This brief will be injected into an AI governance agent's system prompt on EVERY conversation.
Be specific and concrete. Use their actual words where possible. Under 500 tokens.

Format:
Name/handle: [name or "anonymous"]
Background: [1 sentence on who they are in crypto]
Why CLAWD: [their actual reason]

Holder value thesis:
  What they want holding to mean: [answer]

Economic philosophy:
  Burn/return preference: [e.g., "70 returned / 30 burned on 30-day lockup"]
  Philosophy: [deflationary maximalist / utility maximalist / balanced]
  Revenue view: [burns are enough / needs visible revenue / other]

Build priorities:
  Excited about: [list]
  Would oppose: [list]

AI thesis confidence: [high / medium / skeptical]
  What would confirm it: [answer]

Risk tolerance: [X/5 — brief explanation]

Hard lines (instant NO):
  - [list]

Magic wand: "[verbatim quote]"

Biggest concern: [answer]`,
      messages: [{ role: "user", content: `Wallet: ${w}\n\n${answerText}` }],
      maxTokens: 600,
    })) || null;
  } catch (e: any) {
    console.error("Brief generation error:", e.message);
  }

  db.prepare(`
    INSERT OR REPLACE INTO larva_seeds (wallet, answers, identity_brief, completed, updated_at)
    VALUES (?, ?, ?, 1, unixepoch())
  `).run(w, JSON.stringify(answers), identity_brief);

  res.json({ ok: true, identity_brief });
});

// POST /api/chat — calls Anthropic directly with full DB history (persistent memory)
app.post("/api/chat", async (req, res) => {
  const { wallet, message } = req.body;
  if (!wallet || !message) {
    return res.status(400).json({ error: "wallet and message required" });
  }
  if (typeof message !== "string" || message.length > CHAT_MAX_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${CHAT_MAX_LENGTH} characters)` });
  }

  const w = wallet.toLowerCase();

  // Save user message to DB
  db.prepare(
    "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
  ).run(w, "user", message);

  // Load identity brief if the holder completed onboarding
  const seed = db.prepare("SELECT identity_brief FROM larva_seeds WHERE wallet = ? AND completed = 1").get(w) as any;
  const systemPrompt = seed?.identity_brief
    ? `${LARVA_SYSTEM_PROMPT(w)}\n\n---\n## What you know about this holder:\n${seed.identity_brief}`
    : LARVA_SYSTEM_PROMPT(w);

  // Rolling window: load last 30 messages for context (full history stays in DB)
  // If a memory snapshot exists, prepend it and only send last 20 raw messages
  const snapshot = db.prepare(
    "SELECT snapshot FROM memory_snapshots WHERE wallet = ?"
  ).get(w) as any;

  const rawLimit = snapshot ? 20 : 30;
  const history = db.prepare(
    `SELECT role, content FROM chat_messages WHERE wallet = ? ORDER BY created_at DESC LIMIT ${rawLimit}`
  ).all(w).reverse() as { role: string; content: string }[];

  // Inject snapshot as a system note before recent messages
  const contextMessages = snapshot
    ? [{ role: "user" as const, content: `[Memory summary from earlier in our conversation: ${snapshot.snapshot}]` },
       { role: "assistant" as const, content: "Understood — I have that context." },
       ...history]
    : history;

  // Trigger background compression when history gets long (every 40 messages)
  const msgCount = (db.prepare("SELECT COUNT(*) as c FROM chat_messages WHERE wallet = ?").get(w) as any)?.c ?? 0;
  if (msgCount > 0 && msgCount % 40 === 0) {
    compressMemory(w).catch(() => {}); // fire-and-forget
  }

  // Venice primary, Anthropic Haiku fallback.
  try {
    const reply =
      (await chatWithFallback({ system: systemPrompt, messages: contextMessages, maxTokens: 400 })) ||
      "🦞 *confused clicking*";

    // Save assistant reply to DB
    db.prepare(
      "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
    ).run(w, "assistant", reply);

    res.json({ message: reply });
  } catch (e: any) {
    console.error("Chat error:", e.message);
    const fallback = "🦞 *wobbles nervously* Something went wrong with my tiny brain... try again?";
    db.prepare(
      "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
    ).run(w, "assistant", fallback);
    res.json({ message: fallback });
  }
});

// --- Larva Management ---
const larvaProcesses = new Map<string, { port: number; child?: any }>();
let nextLarvaPort = 4100;

function getLarvaPort(walletShort: string): number {
  const info = larvaProcesses.get(walletShort);
  return info?.port || 4000;
}

// GET /api/larva/:wallet/status — verify process is actually alive
app.get("/api/larva/:wallet/status", (req, res) => {
  const walletShort = req.params.wallet.toLowerCase().slice(0, 8);
  const info = larvaProcesses.get(walletShort);
  
  if (info) {
    // Health check the larva
    fetch(`http://localhost:${info.port}/health`).then(r => r.json()).then(data => {
      res.json({ running: true, port: info.port, messages: data.messages });
    }).catch(() => {
      // Process exists in map but isn't responding — clean up
      larvaProcesses.delete(walletShort);
      res.json({ running: false });
    });
  } else {
    res.json({ running: false });
  }
});

// POST /api/larva/:wallet/launch
app.post("/api/larva/:wallet/launch", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  const walletShort = wallet.slice(0, 8);
  
  if (larvaProcesses.has(walletShort)) {
    // Verify it's still alive
    try {
      await fetch(`http://localhost:${larvaProcesses.get(walletShort)!.port}/health`);
      return res.json({ message: "Larva already running", running: true });
    } catch {
      larvaProcesses.delete(walletShort);
    }
  }
  
  const port = nextLarvaPort++;
  
  try {
    const child = spawn("node", [path.join(__dirname, "larva", "server.js")], {
      env: { ...process.env, PORT: String(port), WALLET: wallet, ANTHROPIC_API_KEY },
      stdio: "pipe",
    });
    
    child.stdout?.on("data", (d: Buffer) => console.log(`[larva-${walletShort}] ${d.toString().trim()}`));
    child.stderr?.on("data", (d: Buffer) => console.error(`[larva-${walletShort}] ${d.toString().trim()}`));
    child.on("error", (e: Error) => console.error(`Larva process error: ${e.message}`));
    child.on("exit", () => {
      larvaProcesses.delete(walletShort);
      console.log(`🦞 Larva for ${walletShort} exited`);
    });
    
    larvaProcesses.set(walletShort, { port, child });
    
    // Wait for startup
    await new Promise(r => setTimeout(r, 1500));
    
    console.log(`🦞 Launched larva for ${walletShort} on port ${port}`);
    res.json({ message: "Larva launched!", running: true, port });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🦀 ClawdViction backend running on http://localhost:${PORT}`);
  indexEvents();
});
