-- Telegram one-time login challenges. Codes are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS telegram_auth_challenges (
  id UUID PRIMARY KEY,
  start_token_hash CHAR(64) NOT NULL UNIQUE,
  code_hash CHAR(64),
  telegram_user_id VARCHAR(32),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_auth_challenges_expiry
  ON telegram_auth_challenges(expires_at);
