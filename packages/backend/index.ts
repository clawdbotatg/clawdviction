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

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  const { wallet, message } = req.body;
  if (!wallet || !message) {
    return res.status(400).json({ error: "wallet and message required" });
  }
  
  const w = wallet.toLowerCase();
  const walletShort = w.slice(0, 8);
  
  // Save user message
  db.prepare(
    "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
  ).run(w, "user", message);
  
  // Try to proxy to larva container
  try {
    const resp = await fetch(`http://localhost:${getLarvaPort(walletShort)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await resp.json();
    
    // Save assistant message
    db.prepare(
      "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
    ).run(w, "assistant", data.message);
    
    res.json(data);
  } catch {
    // Fallback if larva not running
    const fallback = "🦞 *snaps tiny claws* I'm not running yet! Launch me first so we can chat about governance!";
    db.prepare(
      "INSERT INTO chat_messages (wallet, role, content) VALUES (?, ?, ?)"
    ).run(w, "assistant", fallback);
    res.json({ message: fallback });
  }
});

// --- Larva Management ---
const larvaProcesses = new Map<string, { port: number; containerId?: string }>();
let nextLarvaPort = 4000;

function getLarvaPort(walletShort: string): number {
  const info = larvaProcesses.get(walletShort);
  return info?.port || 4000;
}

// GET /api/larva/:wallet/status
app.get("/api/larva/:wallet/status", (req, res) => {
  const walletShort = req.params.wallet.toLowerCase().slice(0, 8);
  const info = larvaProcesses.get(walletShort);
  
  if (info) {
    res.json({ running: true, port: info.port });
  } else {
    res.json({ running: false });
  }
});

// POST /api/larva/:wallet/launch
app.post("/api/larva/:wallet/launch", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  const walletShort = wallet.slice(0, 8);
  
  if (larvaProcesses.has(walletShort)) {
    return res.json({ message: "Larva already running", running: true });
  }
  
  const port = nextLarvaPort++;
  
  try {
    // Try Docker first
    const larvaDir = path.join(__dirname, "larva");
    
    try {
      execSync(`docker build -t clawdviction-larva ${larvaDir}`, { stdio: "pipe" });
      const containerName = `larva-${walletShort}`;
      
      // Remove existing container if any
      try { execSync(`docker rm -f ${containerName}`, { stdio: "pipe" }); } catch {}
      
      const result = execSync(
        `docker run -d --name ${containerName} -p ${port}:3000 -e WALLET=${wallet} clawdviction-larva`,
        { encoding: "utf-8" }
      ).trim();
      
      larvaProcesses.set(walletShort, { port, containerId: result });
      console.log(`🦞 Launched larva container ${containerName} on port ${port}`);
    } catch {
      // Fallback: run Node.js process directly
      console.log("Docker not available, running larva as subprocess...");
      const child = spawn("node", [path.join(__dirname, "larva", "server.js")], {
        env: { ...process.env, PORT: String(port), WALLET: wallet },
        stdio: "pipe",
      });
      
      child.on("error", (e) => console.error(`Larva process error: ${e.message}`));
      child.on("exit", () => {
        larvaProcesses.delete(walletShort);
        console.log(`🦞 Larva for ${walletShort} exited`);
      });
      
      larvaProcesses.set(walletShort, { port });
    }
    
    // Wait a moment for startup
    await new Promise(r => setTimeout(r, 1500));
    
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
