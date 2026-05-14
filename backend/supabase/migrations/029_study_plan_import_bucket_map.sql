-- Persist admin-reviewed academic bucket mapping for OCR-imported columns.

ALTER TABLE public.study_plan_pdf_imports
    ADD COLUMN IF NOT EXISTS column_bucket_map jsonb NOT NULL DEFAULT '{}'::jsonb;
