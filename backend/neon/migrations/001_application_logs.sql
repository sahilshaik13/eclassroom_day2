-- Neon Postgres: application logs for super-admin portal (HTTP + warnings + errors)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Apply: psql $DATABASE_URL -f backend/neon/migrations/001_application_logs.sql
-- Or auto-created on API startup via app.core.neon_db.init_neon_pool()

CREATE TABLE IF NOT EXISTS application_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    log_level       TEXT NOT NULL DEFAULT 'info',
    log_type        TEXT NOT NULL DEFAULT 'http_request',
    http_method     TEXT,
    path            TEXT,
    status_code     INTEGER,
    duration_ms     INTEGER,
    actor_user_id   UUID,
    tenant_id       UUID,
    actor_role      TEXT,
    client_ip       TEXT,
    user_agent      TEXT,
    message         TEXT,
    request_id      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT application_logs_level_check
        CHECK (log_level IN ('info', 'warning', 'error')),
    CONSTRAINT application_logs_type_check
        CHECK (log_type IN ('http_request', 'app_event', 'unhandled_error'))
);

CREATE INDEX IF NOT EXISTS idx_application_logs_occurred_at
    ON application_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_logs_tenant_occurred
    ON application_logs (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_logs_level_occurred
    ON application_logs (log_level, occurred_at DESC);
