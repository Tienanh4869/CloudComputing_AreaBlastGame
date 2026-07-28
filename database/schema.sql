-- database/schema.sql
-- ArenaBlast Database Schema
-- PostgreSQL 14+
-- Run: psql -U postgres -d arenablast -f schema.sql

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy nickname search

-- ── Users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Players (game profile) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID         UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname      VARCHAR(30)  UNIQUE NOT NULL,
  total_score   INTEGER      NOT NULL DEFAULT 0,
  wins          INTEGER      NOT NULL DEFAULT 0,
  losses        INTEGER      NOT NULL DEFAULT 0,
  kills         INTEGER      NOT NULL DEFAULT 0,
  deaths        INTEGER      NOT NULL DEFAULT 0,
  avatar_color  VARCHAR(7)   NOT NULL DEFAULT '#4A90D9',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_user_id  ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_nickname  ON players(nickname);
CREATE INDEX IF NOT EXISTS idx_players_score     ON players(total_score DESC);

-- ── Rooms ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(6)   UNIQUE NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players   INTEGER      NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 8),
  player_count  INTEGER      NOT NULL DEFAULT 0,
  created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_code   ON rooms(code);

-- ── Matches ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id          UUID         REFERENCES rooms(id) ON DELETE SET NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'finished')),
  started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  winner_id        UUID         REFERENCES players(id) ON DELETE SET NULL,
  duration_seconds INTEGER,
  player_count     INTEGER      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_status     ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches(started_at DESC);

-- ── Match Players (per-match stats) ─────────────────────────────
CREATE TABLE IF NOT EXISTS match_players (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id   UUID         NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  UUID         NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score      INTEGER      NOT NULL DEFAULT 0,
  kills      INTEGER      NOT NULL DEFAULT 0,
  deaths     INTEGER      NOT NULL DEFAULT 0,
  rank       INTEGER,
  joined_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  left_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_players_match  ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);

-- ── Match Events (event log) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id    UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,
  player_id   UUID        REFERENCES players(id) ON DELETE SET NULL,
  target_id   UUID        REFERENCES players(id) ON DELETE SET NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match      ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_event_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_match_events_player     ON match_events(player_id);

-- ── Leaderboard Scores ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id  UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score      INTEGER     NOT NULL DEFAULT 0,
  rank       INTEGER,
  period     VARCHAR(20) NOT NULL DEFAULT 'all_time' CHECK (period IN ('all_time', 'daily', 'weekly')),
  kills      INTEGER     NOT NULL DEFAULT 0,
  wins       INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, period)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_period_score ON leaderboard_scores(period, score DESC);

-- ── Auto-update updated_at trigger ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','players','rooms','matches','match_players','leaderboard_scores']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_updated_at ON %I;
      CREATE TRIGGER trg_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END $$;
