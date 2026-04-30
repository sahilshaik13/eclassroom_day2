-- 1. Create the Platform Admin role if it doesn't exist
-- Note: PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE, so we check first
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'platform_admin') THEN
        ALTER TYPE user_role ADD VALUE 'platform_admin';
    END IF;
END
$$;

-- 2. Create the Master Tenant for your office
INSERT INTO tenants (name, slug, is_active)
VALUES ('ThinkTarteeb IIC', 'think-tarteeb', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
RETURNING id AS master_tenant_id;

-- 3. Fix the platform_admins table to include tenant_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_admins' AND column_name = 'tenant_id') THEN
        ALTER TABLE platform_admins ADD COLUMN tenant_id uuid REFERENCES tenants(id);
    END IF;
END
$$;

-- 4. Set the Master Tenant for existing platform admins (or future ones)
-- We'll use a subquery to find the Master Tenant ID we just created
UPDATE platform_admins 
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'think-tarteeb')
WHERE tenant_id IS NULL;

-- 5. Refresh schema cache
NOTIFY pgrst, 'reload schema';
