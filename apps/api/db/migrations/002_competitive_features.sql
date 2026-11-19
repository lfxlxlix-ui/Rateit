-- RATEIT: расширение соревновательных функций.
-- Применять после apps/api/db/schema.sql.
-- Здесь только структура данных; реальные очереди и API подключаются отдельным этапом.

CREATE TABLE IF NOT EXISTS parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'queued', 'in_match', 'closed')),
  max_members SMALLINT NOT NULL DEFAULT 5 CHECK (max_members IN (2, 5)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, user_id),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS match_ready_checks (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_map_bans (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  map_name VARCHAR(64) NOT NULL,
  banned_by_user_id UUID NOT NULL REFERENCES users(id),
  ban_order SMALLINT NOT NULL CHECK (ban_order BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, map_name),
  UNIQUE (match_id, ban_order)
);

CREATE TABLE IF NOT EXISTS match_result_confirmations (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_team SMALLINT NOT NULL CHECK (submitted_team IN (1, 2)),
  team_a_score SMALLINT NOT NULL CHECK (team_a_score >= 0),
  team_b_score SMALLINT NOT NULL CHECK (team_b_score >= 0),
  screenshot_url TEXT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL UNIQUE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS season_player_stats (
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  elo_start INTEGER NOT NULL DEFAULT 751 CHECK (elo_start >= 0),
  elo_current INTEGER NOT NULL DEFAULT 751 CHECK (elo_current >= 0),
  matches_played INTEGER NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id),
  CHECK (wins + losses <= matches_played)
);

CREATE TABLE IF NOT EXISTS match_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(24) NOT NULL
    CHECK (category IN ('result_dispute', 'player_behavior', 'cheating_suspicion', 'other')),
  description VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (match_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id);
CREATE INDEX IF NOT EXISTS idx_parties_status_created ON parties(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ready_checks_match_status ON match_ready_checks(match_id, status);
CREATE INDEX IF NOT EXISTS idx_map_bans_match_order ON match_map_bans(match_id, ban_order);
CREATE INDEX IF NOT EXISTS idx_season_stats_leaderboard ON season_player_stats(season_id, elo_current DESC);
CREATE INDEX IF NOT EXISTS idx_match_reports_status_created ON match_reports(status, created_at);
