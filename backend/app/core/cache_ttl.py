"""Simplified Redis cache TTLs (seconds).

Reduced to 4 tiers for clarity:
- HOT (30s): Dashboards, active tasks - changes frequently
- WARM (120s): Frequently accessed but not critical
- STANDARD (300s): Study plans, reports - expensive to load
- LONG (3600s): Metadata that rarely changes
"""

# Tier 1: Hot data - dashboards, active tasks (30 seconds)
HOT = 30
DASHBOARD = HOT
PULSE = HOT
TEACHER_PULSE = HOT  # Today's curriculum - same for the whole day
STUDENT_TASKS_TODAY = HOT  # Today's curriculum - same for the whole day
SUPER_ADMIN = HOT
AUDIT_LOG_TOTAL = HOT
AUDIT_LOG_PAGE = HOT  # First-page list; bust on each new log via Redis pub/sub

# Tier 2: Warm data - frequently accessed but not critical (2 minutes)
WARM = 120
STUDENT_REPORT = WARM
COMPETITION_INFO = WARM
STUDENT_COMPETITIONS = WARM
ADMIN_COMPETITIONS = WARM
TEACHER_STUDENT_OVERVIEW = WARM
ADMIN_STATS = WARM

# Tier 3: Standard data - study plans, reports (5 minutes)
STANDARD = 300
STUDY_PLAN = STANDARD
PUBLIC_TENANT = STANDARD

# Tier 4: Long-lived - metadata that rarely changes (1 hour)
LONG = 3600
