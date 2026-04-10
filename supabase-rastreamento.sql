-- ================================================================
--  AGENDA JU — Rastreamento de Motos
--  Tabelas para o sistema de monitoramento GPS
--  Execute no Supabase SQL Editor
-- ================================================================

-- ── 1. aju_motorcycles — Cadastro de motos ───────────────────────
CREATE TABLE IF NOT EXISTS public.aju_motorcycles (
  id            UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID          REFERENCES public.aju_users(id) ON DELETE CASCADE,
  name          VARCHAR(100)  NOT NULL,
  plate         VARCHAR(20),
  tracker_imei  VARCHAR(20),
  color         VARCHAR(20)   DEFAULT '#ec4899',
  icon          VARCHAR(10)   DEFAULT '🏍️',
  active        BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 2. aju_moto_positions — Posicoes GPS ─────────────────────────
CREATE TABLE IF NOT EXISTS public.aju_moto_positions (
  id             UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  motorcycle_id  UUID          REFERENCES public.aju_motorcycles(id) ON DELETE CASCADE,
  latitude       NUMERIC(10,7) NOT NULL,
  longitude      NUMERIC(10,7) NOT NULL,
  speed          NUMERIC(6,2)  DEFAULT 0,
  heading        NUMERIC(5,2)  DEFAULT 0,
  ignition       BOOLEAN       DEFAULT FALSE,
  battery        NUMERIC(5,2),
  address        TEXT,
  recorded_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- Indice para buscar ultima posicao rapidamente
CREATE INDEX IF NOT EXISTS idx_moto_pos_moto_time
  ON public.aju_moto_positions (motorcycle_id, recorded_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.aju_motorcycles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aju_moto_positions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_motorcycles' AND policyname='aju_motorcycles_pol')
    THEN CREATE POLICY aju_motorcycles_pol ON public.aju_motorcycles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aju_moto_positions' AND policyname='aju_moto_positions_pol')
    THEN CREATE POLICY aju_moto_positions_pol ON public.aju_moto_positions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
--  FUNCAO para inserir posicao via API (para integracao com Rastro System)
--
--  Uso: POST para Supabase REST API
--  https://<seu-projeto>.supabase.co/rest/v1/rpc/aju_insert_position
--  Body: { "p_imei": "123456789012345", "p_lat": -23.5505, "p_lng": -46.6333, "p_speed": 45.5, "p_heading": 180, "p_ignition": true, "p_battery": 95 }
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aju_insert_position(
  p_imei     TEXT,
  p_lat      NUMERIC,
  p_lng      NUMERIC,
  p_speed    NUMERIC DEFAULT 0,
  p_heading  NUMERIC DEFAULT 0,
  p_ignition BOOLEAN DEFAULT FALSE,
  p_battery  NUMERIC DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_moto_id UUID;
BEGIN
  SELECT id INTO v_moto_id FROM public.aju_motorcycles
    WHERE tracker_imei = p_imei AND active = TRUE LIMIT 1;

  IF v_moto_id IS NULL THEN
    RETURN json_build_object('error', 'IMEI nao encontrado');
  END IF;

  INSERT INTO public.aju_moto_positions (motorcycle_id, latitude, longitude, speed, heading, ignition, battery)
  VALUES (v_moto_id, p_lat, p_lng, p_speed, p_heading, p_ignition, p_battery);

  RETURN json_build_object('ok', true, 'motorcycle_id', v_moto_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
