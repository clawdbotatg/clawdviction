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

  // Migrations — run once at init, not on every request
  await sql`ALTER TABLE governance_responses ADD COLUMN IF NOT EXISTS human_override TEXT`;
  await sql`ALTER TABLE governance_responses ADD COLUMN IF NOT EXISTS human_note TEXT`;
  await sql`ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS aggregated_opinion TEXT`;
  await sql`ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS aggregated_opinion_short TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS labs_ideas (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      cv_burned BIGINT NOT NULL DEFAULT 500000,
      total_cv BIGINT NOT NULL DEFAULT 500000,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS labs_stakes (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      idea_id INTEGER NOT NULL REFERENCES labs_ideas(id),
      cv_amount BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Labs larva opinions
  await sql`
    CREATE TABLE IF NOT EXISTS labs_queue (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL REFERENCES labs_ideas(id),
      wallet TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      UNIQUE(idea_id, wallet)
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS labs_responses (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL REFERENCES labs_ideas(id),
      wallet TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(idea_id, wallet)
    )`;

  await sql`ALTER TABLE labs_ideas ADD COLUMN IF NOT EXISTS larva_triggered BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE labs_ideas ADD COLUMN IF NOT EXISTS aggregated_opinion TEXT`;
  await sql`ALTER TABLE labs_ideas ADD COLUMN IF NOT EXISTS aggregated_opinion_short TEXT`;
  await sql`ALTER TABLE labs_ideas ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE labs_ideas ADD COLUMN IF NOT EXISTS archived_by TEXT`;

  await sql`ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS archived_by TEXT`;
  await sql`ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS total_cv BIGINT NOT NULL DEFAULT 0`;
  // Backfill total_cv from cv_burned for posts created before staking existed
  await sql`UPDATE forum_posts SET total_cv = cv_burned WHERE total_cv = 0 AND cv_burned > 0`;

  await sql`
    CREATE TABLE IF NOT EXISTS forum_stakes (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
      cv_amount BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Centralized failure log for every AI surface — chat, greet, queue processors,
  // aggregators, memory compression. Lets the admin page surface failures that
  // otherwise leave no trace (auth/CV/rate rejections never hit chat_messages).
  await sql`
    CREATE TABLE IF NOT EXISTS larva_errors (
      id SERIAL PRIMARY KEY,
      surface TEXT NOT NULL,
      error_type TEXT NOT NULL,
      wallet TEXT,
      status_code INTEGER,
      message TEXT,
      context JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_larva_errors_created ON larva_errors(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_larva_errors_surface ON larva_errors(surface, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_larva_errors_wallet ON larva_errors(wallet, created_at DESC) WHERE wallet IS NOT NULL`;

  // Trello-style job board on the labs page. Admin-managed cards that
  // track real work moving through idea → build → test → shipped.
  await sql`
    CREATE TABLE IF NOT EXISTS labs_jobs (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'idea',
      archived BOOLEAN NOT NULL DEFAULT false,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_labs_jobs_phase ON labs_jobs(phase, updated_at DESC)`;

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

    const apiKey = process.env.VENICE_API_KEY;
    const baseUrl = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
    if (!apiKey) return;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "zai-org-glm-5",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `Summarize this conversation between a user and their AI governance larva. Preserve: key values, preferences, governance positions, personality traits, and any commitments made. Be concise but complete.\n\n${transcript}`,
          },
        ],
        venice_parameters: { include_venice_system_prompt: false, strip_thinking_response: true },
      }),
    });

    const data = await res.json();
    const snapshot = data.choices?.[0]?.message?.content;
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
