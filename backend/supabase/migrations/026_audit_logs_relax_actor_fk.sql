-- Allow audit logs to record platform/super-admin requests even when the
-- auth subject does not have a matching row in public.users.

ALTER TABLE public.audit_log_recent
DROP CONSTRAINT IF EXISTS audit_log_recent_actor_user_id_fkey;
