-- ================================================================
--  AGENDA JU — Atualização v2
--  Execute no Supabase SQL Editor
--  Adiciona colunas novas em aju_events e cria tabelas aju_shopping e aju_vault
-- ================================================================

-- ── Novos campos em aju_events ────────────────────────────────
ALTER TABLE public.aju_events ADD COLUMN IF NOT EXISTS notify_event BOOLEAN DEFAULT FALSE;
ALTER TABLE public.aju_events ADD COLUMN IF NOT EXISTS repeat VARCHAR(10) DEFAULT NULL;
ALTER TABLE public.aju_events ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT FALSE;

-- ── aju_shopping (Lista de Mercado) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_shopping (
  id         UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  quantity   VARCHAR(50)  DEFAULT '',
  checked    BOOLEAN      DEFAULT FALSE,
  category   VARCHAR(50)  DEFAULT 'Outros',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
ALTER TABLE public.aju_shopping ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_shopping' AND policyname='aju_shopping_pol') THEN
    CREATE POLICY aju_shopping_pol ON public.aju_shopping FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── aju_vault (Cofre criptografado) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_vault (
  id         UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID         REFERENCES public.aju_users(id) ON DELETE CASCADE,
  type       VARCHAR(20)  DEFAULT 'password',
  title      VARCHAR(255) NOT NULL,
  data_enc   TEXT         NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);
ALTER TABLE public.aju_vault ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_vault' AND policyname='aju_vault_pol') THEN
    CREATE POLICY aju_vault_pol ON public.aju_vault FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
