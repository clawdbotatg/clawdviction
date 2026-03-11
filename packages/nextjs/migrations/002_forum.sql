-- Forum posts
CREATE TABLE IF NOT EXISTS forum_posts (
  id SERIAL PRIMARY KEY,
  wallet TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cv_burned BIGINT NOT NULL DEFAULT 0,
  larva_triggered BOOLEAN NOT NULL DEFAULT false,
  aggregated_opinion TEXT,
  aggregated_opinion_short TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Human replies
CREATE TABLE IF NOT EXISTS forum_replies (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  body TEXT NOT NULL,
  cv_burned BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Larva responses (one per larva per post, queued + processed like governance)
CREATE TABLE IF NOT EXISTS forum_responses (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  response TEXT,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, wallet)
);

-- Queue for larva processing
CREATE TABLE IF NOT EXISTS forum_queue (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(post_id, wallet)
);
