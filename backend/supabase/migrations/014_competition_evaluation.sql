-- ============================================================
-- 014_competition_evaluation.sql
-- ThinkTarteeb E-Classroom — Teacher Evaluation Enhancements
-- ============================================================

-- Add results_released flag to registrations so evaluation can be staged
ALTER TABLE public.competition_registrations
ADD COLUMN IF NOT EXISTS results_released BOOLEAN DEFAULT FALSE;
