CREATE TABLE IF NOT EXISTS matchmaking_queue (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(4) NOT NULL CHECK (mode IN ('2x2','5x5')),
  hours INTEGER NOT NULL CHECK (hours >= 0),
  elo INTEGER NOT NULL CHECK (elo >= 0),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_mode_joined
ON matchmaking_queue(mode, joined_at);
