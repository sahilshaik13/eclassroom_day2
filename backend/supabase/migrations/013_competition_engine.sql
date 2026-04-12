-- ============================================================
-- 013_competition_engine.sql
-- Upgrading competition module to a full Exam Engine
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_category') THEN
        CREATE TYPE competition_category AS ENUM ('mcq', 'hifz', 'khirat');
    END IF;
END $$;

-- 1. Modify competitions table
ALTER TABLE public.competitions 
ADD COLUMN IF NOT EXISTS category competition_category DEFAULT 'mcq',
ADD COLUMN IF NOT EXISTS content JSONB DEFAULT '[]'::jsonb, -- Array of MCQs or Passages
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb; -- Duration, rules, etc.

-- 2. Modify competition_registrations table
ALTER TABLE public.competition_registrations
ADD COLUMN IF NOT EXISTS responses JSONB DEFAULT '[]'::jsonb, -- Array of answers or audio URLs
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN DEFAULT FALSE;

-- Ensure RLS is still enabled (migration 012 already did this but good to confirm)
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_results ENABLE ROW LEVEL SECURITY;
