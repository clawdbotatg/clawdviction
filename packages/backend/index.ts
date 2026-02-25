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

// GET /api/chat/history/:wallet — load conversation history
app.get("/api/chat/history/:wallet", (req, res) => {
  const w = req.params.wallet.toLowerCase();
  const history = db.prepare(
    "SELECT role, content FROM chat_messages WHERE wallet = ? ORDER BY created_at ASC LIMIT 100"
  ).all(w) as { role: string; content: string }[];
  res.json({ messages: history });
});

// POST /api/chat — calls Anthropic directly with full DB history (persistent memory)
app.post("/api/chat", async (req, res) => {
  const { wallet, message } = req.body;
  if (!wallet || !message) {
    return res.status(400).json({ error: "wallet and message required" });
  }

  const w = wallet.toLowerCase();

  // Save user message to DB
  db.prepare(
    "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
  ).run(w, "user", message);

  // Load full conversation history from DB (last 50 messages)
  const history = db.prepare(
    "SELECT role, content FROM chat_messages WHERE wallet = ? ORDER BY created_at ASC LIMIT 50"
  ).all(w) as { role: string; content: string }[];

  // Call Anthropic directly with persistent history
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: LARVA_SYSTEM_PROMPT(w),
        messages: history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic ${resp.status}`);

    const data = await resp.json();
    const reply = data.content?.[0]?.text || "🦞 *confused clicking*";

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

// Read Anthropic API key for larvae
const ANTHROPIC_API_KEY = (() => {
  try {
    const authPath = path.join(process.env.HOME || "", ".openclaw/agents/clawdheart/agent/auth-profiles.json");
    const auth = JSON.parse(require("fs").readFileSync(authPath, "utf-8"));
    return auth.profiles["anthropic:default"]?.key || "";
  } catch { return process.env.ANTHROPIC_API_KEY || ""; }
})();

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
