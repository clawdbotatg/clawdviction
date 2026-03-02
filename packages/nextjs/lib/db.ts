import { sql } from "@vercel/postgres";

export { sql };

let dbInitialized = false;
let dbAvailable: boolean | null = null;

export async function isDbAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  if (!process.env.POSTGRES_URL) {
    dbAvailable = false;
    return false;
  }
  try {
    await sql`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

export async function initDb() {
  if (dbInitialized) return;
  if (!(await isDbAvailable())) return;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_chat_wallet ON chat_messages(wallet, created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS memory_snapshots (
      wallet TEXT PRIMARY KEY,
      snapshot TEXT NOT NULL,
      message_count INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS larva_seeds (
      wallet TEXT PRIMARY KEY,
      answers JSONB NOT NULL DEFAULT '{}',
      identity_brief TEXT,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS clawdviction_balances (
      wallet TEXT PRIMARY KEY,
      balance NUMERIC NOT NULL DEFAULT 0,
      last_accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accrual_rate NUMERIC NOT NULL DEFAULT 0,
      total_earned NUMERIC NOT NULL DEFAULT 0,
      total_spent NUMERIC NOT NULL DEFAULT 0
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS governance_proposals (
      id SERIAL PRIMARY KEY,
      type VARCHAR(10) NOT NULL CHECK (type IN ('rfc', 'vote')),
      title TEXT NOT NULL,
      question TEXT NOT NULL,
      created_by VARCHAR(42) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'active'
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS governance_responses (
      id SERIAL PRIMARY KEY,
      proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id),
      wallet VARCHAR(42) NOT NULL,
      response TEXT NOT NULL,
      reasoning TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(proposal_id, wallet)
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS governance_queue (
      id SERIAL PRIMARY KEY,
      proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id),
      wallet VARCHAR(42) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      UNIQUE(proposal_id, wallet)
    )`;

  dbInitialized = true;
}

export async function compressMemory(wallet: string) {
  try {
    await initDb();
    if (!(await isDbAvailable())) return;

    // Get total message count
    const countResult = await sql`SELECT COUNT(*) as cnt FROM chat_messages WHERE wallet = ${wallet}`;
    const total = parseInt(countResult.rows[0].cnt);
    if (total < 40) return;

    // Fetch messages older than the last 20
    const older = await sql`
      SELECT role, content FROM chat_messages
      WHERE wallet = ${wallet}
      ORDER BY created_at ASC
      LIMIT ${total - 20}`;

    if (older.rows.length === 0) return;

    const transcript = older.rows.map(r => `${r.role}: ${r.content}`).join("\n");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `Summarize this conversation between a user and their AI governance larva. Preserve: key values, preferences, governance positions, personality traits, and any commitments made. Be concise but complete.\n\n${transcript}`,
          },
        ],
      }),
    });

    const data = await res.json();
    const snapshot = data.content?.[0]?.text;
    if (!snapshot) return;

    await sql`
      INSERT INTO memory_snapshots (wallet, snapshot, message_count, updated_at)
      VALUES (${wallet}, ${snapshot}, ${total}, NOW())
      ON CONFLICT (wallet) DO UPDATE SET
        snapshot = ${snapshot},
        message_count = ${total},
        updated_at = NOW()`;
  } catch (e) {
    console.error("Memory compression error:", e);
  }
}
