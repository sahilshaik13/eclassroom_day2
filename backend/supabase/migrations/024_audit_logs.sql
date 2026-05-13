-- ============================================================
-- AUDIT LOGS: 7-day hot store + 30-day cold archive
-- ============================================================
-- Hot table (audit_log_recent): rolling ~7 days by occurred_at; shown in super-admin UI.
-- Archive (audit_log_archive): rows older than 7 days moved here; purged when occurred_at
-- is older than 37 days (7 hot + 30 archive retention from event time).
-- Rotation: public.rotate_audit_logs() — call via PostgREST RPC or pg_cron.

CREATE TABLE IF NOT EXISTS public.audit_log_recent (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    actor_role      TEXT,
    http_method     TEXT NOT NULL,
    path            TEXT NOT NULL,
    status_code     INTEGER,
    duration_ms     INTEGER,
    client_ip       TEXT,
    user_agent      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.audit_log_archive (
    id              UUID PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL,
    actor_user_id   UUID,
    tenant_id       UUID,
    actor_role      TEXT,
    http_method     TEXT NOT NULL,
    path            TEXT NOT NULL,
    status_code     INTEGER,
    duration_ms     INTEGER,
    client_ip       TEXT,
    user_agent      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_recent_occurred_at
    ON public.audit_log_recent (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_recent_tenant_occurred
    ON public.audit_log_recent (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_occurred_at
    ON public.audit_log_archive (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_archived_at
    ON public.audit_log_archive (archived_at DESC);

ALTER TABLE public.audit_log_recent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_archive ENABLE ROW LEVEL SECURITY;

-- No policies: only service_role (backend) inserts/selects; anon/authenticated have no access.

COMMENT ON TABLE public.audit_log_recent IS 'API audit trail — last 7 days by occurred_at (super-admin dashboard).';
COMMENT ON TABLE public.audit_log_archive IS 'Archived audit rows (days 8–37); not exposed in UI.';

CREATE OR REPLACE FUNCTION public.rotate_audit_logs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    moved   INTEGER := 0;
    purged  INTEGER := 0;
BEGIN
    -- Move events older than 7 days out of the hot table into archive
    INSERT INTO public.audit_log_archive (
        id, occurred_at, actor_user_id, tenant_id, actor_role,
        http_method, path, status_code, duration_ms, client_ip, user_agent, metadata, archived_at
    )
    SELECT
        r.id, r.occurred_at, r.actor_user_id, r.tenant_id, r.actor_role,
        r.http_method, r.path, r.status_code, r.duration_ms, r.client_ip, r.user_agent, r.metadata,
        now()
    FROM public.audit_log_recent r
    WHERE r.occurred_at < (now() - interval '7 days');

    GET DIAGNOSTICS moved = ROW_COUNT;

    DELETE FROM public.audit_log_recent
    WHERE occurred_at < (now() - interval '7 days');

    -- Drop very old archive rows (30 days of archive after the 7-day hot window)
    DELETE FROM public.audit_log_archive
    WHERE occurred_at < (now() - interval '37 days');

    GET DIAGNOSTICS purged = ROW_COUNT;

    RETURN jsonb_build_object(
        'rows_archived', moved,
        'archive_rows_deleted', purged
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_audit_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_audit_logs() TO service_role;

-- Optional: after enabling "pg_cron" in Supabase → Database → Extensions, schedule rotation:
--   SELECT cron.schedule('rotate_audit_logs', '15 * * * *', 'SELECT public.rotate_audit_logs();');
-- The API also runs this function hourly via app lifespan.
