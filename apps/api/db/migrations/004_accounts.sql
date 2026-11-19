ALTER TABLE users ADD COLUMN IF NOT EXISTS login_name VARCHAR(24);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_name_ci ON users (lower(login_name)) WHERE login_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_provider_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_check CHECK (provider IN ('email','google','telegram','facebook','vk','yandex'));
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

ALTER TABLE telegram_auth_challenges ADD COLUMN IF NOT EXISTS purpose VARCHAR(12) NOT NULL DEFAULT 'login' CHECK (purpose IN ('login','link'));
ALTER TABLE telegram_auth_challenges ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
