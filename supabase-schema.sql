-- ================================================================
--  AGENDA JU — SQL para o Supabase SQL Editor
--  Schema: PUBLIC  (sempre exposto, sem configuração extra)
--  Tabelas com prefixo aju_ para não conflitar com nada existente
--  ⚠️  Não altera nenhuma tabela existente do seu projeto
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. aju_users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_users (
  id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 2. aju_notes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_notes (
  id         UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  content    TEXT         DEFAULT '',
  color      VARCHAR(20)  DEFAULT '#fce7f3',
  pinned     BOOLEAN      DEFAULT FALSE,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 3. aju_reminders ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_reminders (
  id             UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
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

-- ── 4. aju_tasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_tasks (
  id          UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  due_date    DATE,
  completed   BOOLEAN      DEFAULT FALSE,
  priority    VARCHAR(10)  DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
  category    VARCHAR(50)  DEFAULT 'Pessoal',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 5. aju_events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_events (
  id          UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
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

-- ── 6. aju_habits ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_habits (
  id             UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  icon           VARCHAR(10)  DEFAULT '💧',
  frequency      VARCHAR(10)  DEFAULT 'daily'
                   CHECK (frequency IN ('daily','weekly')),
  streak         INTEGER      DEFAULT 0,
  last_completed DATE,
  color          VARCHAR(20)  DEFAULT '#fce7f3',
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ── 7. aju_habit_logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_habit_logs (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  habit_id     UUID        REFERENCES public.aju_habits(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. aju_finances ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_finances (
  id         UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID          REFERENCES public.aju_users(id) ON DELETE CASCADE,
  title      VARCHAR(255)  NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  type       VARCHAR(10)   NOT NULL CHECK (type IN ('income','expense')),
  category   VARCHAR(50)   NOT NULL,
  date       DATE          NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ   DEFAULT NOW()
);

-- ================================================================
--  ROW LEVEL SECURITY — apenas nas tabelas aju_
-- ================================================================
ALTER TABLE public.aju_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_reminders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_habits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_finances   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_users'      AND policyname='aju_users_pol')      THEN CREATE POLICY aju_users_pol      ON public.aju_users      FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_notes'      AND policyname='aju_notes_pol')      THEN CREATE POLICY aju_notes_pol      ON public.aju_notes      FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_reminders'  AND policyname='aju_reminders_pol')  THEN CREATE POLICY aju_reminders_pol  ON public.aju_reminders  FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_tasks'      AND policyname='aju_tasks_pol')      THEN CREATE POLICY aju_tasks_pol      ON public.aju_tasks      FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_events'     AND policyname='aju_events_pol')     THEN CREATE POLICY aju_events_pol     ON public.aju_events     FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_habits'     AND policyname='aju_habits_pol')     THEN CREATE POLICY aju_habits_pol     ON public.aju_habits     FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_habit_logs' AND policyname='aju_habit_logs_pol') THEN CREATE POLICY aju_habit_logs_pol ON public.aju_habit_logs FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_finances'   AND policyname='aju_finances_pol')   THEN CREATE POLICY aju_finances_pol   ON public.aju_finances   FOR ALL USING (true) WITH CHECK (true); END IF;
END $$;
