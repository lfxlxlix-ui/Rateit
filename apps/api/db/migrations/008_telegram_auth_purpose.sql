-- Extend existing Telegram challenges for login and account linking.
ALTER TABLE telegram_auth_challenges
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'login';

ALTER TABLE telegram_auth_challenges
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE telegram_auth_challenges
  ADD CONSTRAINT telegram_auth_challenges_purpose_check
  CHECK (purpose IN ('login', 'link'));
