-- Начальная схема RATEIT для PostgreSQL.
-- Миграция описывает структуру; подключение БД и запуск миграций ещё не настроены.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(24) NOT NULL,
  standoff2_id VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'telegram', 'facebook')),
  provider_user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE TABLE player_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  elo INTEGER NOT NULL DEFAULT 751 CHECK (elo >= 0),
  level SMALLINT NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 10),
  verified_hours INTEGER CHECK (verified_hours >= 0),
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (wins + losses <= matches_played)
);

CREATE TABLE friendships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode VARCHAR(4) NOT NULL CHECK (mode IN ('2x2', '5x5')),
  map_name VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT 'forming' CHECK (status IN ('forming', 'ready', 'in_progress', 'completed', 'cancelled')),
  team_a_score SMALLINT,
  team_b_score SMALLINT,
  winner_team SMALLINT CHECK (winner_team IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE match_players (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  team SMALLINT NOT NULL CHECK (team IN (1, 2)),
  elo_before INTEGER NOT NULL,
  elo_change INTEGER,
  kills SMALLINT,
  deaths SMALLINT,
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE elo_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_players_user ON match_players(user_id);
CREATE INDEX idx_matches_created_at ON matches(created_at DESC);
CREATE INDEX idx_elo_history_user_created ON elo_history(user_id, created_at DESC);
CREATE INDEX idx_friendships_friend_status ON friendships(friend_id, status);
