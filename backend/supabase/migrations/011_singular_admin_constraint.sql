-- Enforce 1:1 relationship between Tenant and Admin
-- This creates a partial unique index that only applies to users with the 'admin' role.
-- This ensures that for any given tenant_id, there can only be ONE user where role = 'admin'.

DROP INDEX IF EXISTS idx_unique_tenant_admin;

CREATE UNIQUE INDEX idx_unique_tenant_admin ON public.users (tenant_id) 
WHERE (role = 'admin' AND deactivated_at IS NULL);

-- Migration complete.
