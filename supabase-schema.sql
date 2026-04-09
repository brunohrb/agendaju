-- ================================================================
--  AGENDA JU — SQL para o Supabase SQL Editor
--  Schema: agendaju  (já criado e exposto na Data API ✅)
--  ⚠️  Não altera nada dos schemas public / treino / graphql_public
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. USERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.users (
  id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. NOTES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.notes (
  id         UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID         REFERENCES agendaju.users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  content    TEXT         DEFAULT '',
  color      VARCHAR(20)  DEFAULT '#fce7f3',
  pinned     BOOLEAN      DEFAULT FALSE,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 3. REMINDERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.reminders (
  id             UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID         REFERENCES agendaju.users(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  due_date       DATE         NOT NULL,
  due_time       TIME,
  completed      BOOLEAN      DEFAULT FALSE,
  notify_browser BOOLEAN      DEFAULT TRUE,
  priority       VARCHAR(10)  DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high')),
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 4. TASKS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.tasks (
  id          UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID         REFERENCES agendaju.users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  due_date    DATE,
  completed   BOOLEAN      DEFAULT FALSE,
  priority    VARCHAR(10)  DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
  category    VARCHAR(50)  DEFAULT 'Pessoal',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 5. EVENTS (Agenda/Calendário) ────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.events (
  id          UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID         REFERENCES agendaju.users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  start_date  DATE         NOT NULL,
  end_date    DATE,
  start_time  TIME,
  end_time    TIME,
  color       VARCHAR(20)  DEFAULT '#f9a8d4',
  location    TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 6. HABITS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.habits (
  id             UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID         REFERENCES agendaju.users(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  icon           VARCHAR(10)  DEFAULT '💧',
  frequency      VARCHAR(10)  DEFAULT 'daily'
                   CHECK (frequency IN ('daily','weekly')),
  streak         INTEGER      DEFAULT 0,
  last_completed DATE,
  color          VARCHAR(20)  DEFAULT '#fce7f3',
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 7. HABIT_LOGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.habit_logs (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  habit_id     UUID        REFERENCES agendaju.habits(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. FINANCES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendaju.finances (
  id         UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID          REFERENCES agendaju.users(id) ON DELETE CASCADE,
  title      VARCHAR(255)  NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  type       VARCHAR(10)   NOT NULL CHECK (type IN ('income','expense')),
  category   VARCHAR(50)   NOT NULL,
  date       DATE          NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ   DEFAULT NOW()
);

-- ================================================================
--  ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE agendaju.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.reminders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.habits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendaju.finances   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='users'      AND policyname='aju_users')      THEN CREATE POLICY aju_users      ON agendaju.users      FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='notes'      AND policyname='aju_notes')      THEN CREATE POLICY aju_notes      ON agendaju.notes      FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='reminders'  AND policyname='aju_reminders')  THEN CREATE POLICY aju_reminders  ON agendaju.reminders  FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='tasks'      AND policyname='aju_tasks')      THEN CREATE POLICY aju_tasks      ON agendaju.tasks      FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='events'     AND policyname='aju_events')     THEN CREATE POLICY aju_events     ON agendaju.events     FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='habits'     AND policyname='aju_habits')     THEN CREATE POLICY aju_habits     ON agendaju.habits     FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='habit_logs' AND policyname='aju_habit_logs') THEN CREATE POLICY aju_habit_logs ON agendaju.habit_logs FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='agendaju' AND tablename='finances'   AND policyname='aju_finances')   THEN CREATE POLICY aju_finances   ON agendaju.finances   FOR ALL USING (true) WITH CHECK (true); END IF;
END $$;
