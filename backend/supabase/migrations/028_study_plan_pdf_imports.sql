-- Class-specific yearly study-plan PDF imports via NexusOCR.
-- Stores the uploaded PDF, OCR progress/result, selected table rows,
-- and links the applied import to the active classroom study plan.

DO $$
BEGIN
    ALTER TYPE plan_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.study_plans
    ADD COLUMN IF NOT EXISTS source_import_id uuid,
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS archived_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.study_plan_pdf_imports (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    class_id            uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id          uuid REFERENCES public.users(id) ON DELETE SET NULL,
    uploaded_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
    pdf_bucket          text NOT NULL DEFAULT 'study-plan-pdfs',
    pdf_storage_path    text NOT NULL,
    original_filename   text,
    file_size_bytes     bigint,
    ocr_provider        text NOT NULL DEFAULT 'nexusocr',
    ocr_job_id          text,
    ocr_status          text NOT NULL DEFAULT 'pending'
                        CHECK (ocr_status IN ('pending', 'uploading', 'processing', 'completed', 'failed', 'cancelled', 'applied')),
    total_chunks        integer NOT NULL DEFAULT 0,
    completed_chunks    integer NOT NULL DEFAULT 0,
    failed_chunks       integer NOT NULL DEFAULT 0,
    detected_columns    jsonb NOT NULL DEFAULT '[]'::jsonb,
    selected_columns    jsonb NOT NULL DEFAULT '[]'::jsonb,
    extracted_rows      jsonb NOT NULL DEFAULT '[]'::jsonb,
    filtered_rows       jsonb NOT NULL DEFAULT '[]'::jsonb,
    applied_rows        jsonb NOT NULL DEFAULT '[]'::jsonb,
    latest_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
    parse_message       text,
    applied_plan_id     uuid REFERENCES public.study_plans(id) ON DELETE SET NULL,
    archived_plan_id    uuid REFERENCES public.study_plans(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_study_plan_pdf_imports_tenant
    ON public.study_plan_pdf_imports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_study_plan_pdf_imports_class
    ON public.study_plan_pdf_imports (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_study_plan_pdf_imports_job
    ON public.study_plan_pdf_imports (ocr_job_id);

ALTER TABLE public.study_plan_pdf_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_study_plan_pdf_imports" ON public.study_plan_pdf_imports;
CREATE POLICY "tenant_study_plan_pdf_imports"
    ON public.study_plan_pdf_imports
    FOR ALL
    USING (tenant_id = get_tenant_id())
    WITH CHECK (tenant_id = get_tenant_id());

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'study_plans_source_import_id_fkey'
          AND table_name = 'study_plans'
    ) THEN
        ALTER TABLE public.study_plans
            ADD CONSTRAINT study_plans_source_import_id_fkey
            FOREIGN KEY (source_import_id)
            REFERENCES public.study_plan_pdf_imports(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE TRIGGER trg_study_plan_pdf_imports_updated_at
  BEFORE UPDATE ON public.study_plan_pdf_imports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'study-plan-pdfs',
    'study-plan-pdfs',
    false,
    52428800,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
