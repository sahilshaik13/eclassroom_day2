-- PDF-backed curriculum per teacher (Supabase Storage + template linkage)

ALTER TABLE study_plan_days ADD COLUMN IF NOT EXISTS is_accessible boolean NOT NULL DEFAULT false;
-- Admin uploads a PDF; backend stub "AI" builds calendar days on a dedicated template
-- and links all of that teacher's classes to that template.

CREATE TABLE IF NOT EXISTS teacher_curriculum_sources (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    teacher_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id       uuid REFERENCES study_plan_templates(id) ON DELETE SET NULL,
    pdf_bucket        text NOT NULL DEFAULT 'curriculum-pdfs',
    pdf_storage_path  text NOT NULL,
    original_filename text,
    uploaded_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    parse_status      text NOT NULL DEFAULT 'pending'
                        CHECK (parse_status IN ('pending', 'processing', 'ready', 'failed')),
    parse_message     text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS ix_teacher_curriculum_tenant ON teacher_curriculum_sources(tenant_id);
CREATE INDEX IF NOT EXISTS ix_teacher_curriculum_teacher ON teacher_curriculum_sources(teacher_id);

ALTER TABLE teacher_curriculum_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_teacher_curriculum_admin"
    ON teacher_curriculum_sources FOR ALL
    USING (tenant_id = get_tenant_id());

-- Private bucket for curriculum PDFs (signed URLs issued by API)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'curriculum-pdfs',
    'curriculum-pdfs',
    false,
    52428800,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
