-- Ephemeral OTP table for custom SMS flow
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup and cleanup
CREATE INDEX idx_otp_phone_tenant ON otp_codes(phone, tenant_id);

-- RLS: Only service role can touch this
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON otp_codes FOR ALL USING (auth.role() = 'service_role');
