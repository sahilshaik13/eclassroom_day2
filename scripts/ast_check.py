"""Syntax check all modified backend files via ast.parse."""
import ast
import sys
from pathlib import Path

ROOT = Path(r"F:\eclassroom_day2\backend\app")
files = [
    "api/v1/routes/public.py",
    "api/v1/routes/student.py",
    "api/v1/routes/superadmin.py",
    "api/v1/routes/teacher.py",
    "core/cache_service.py",
    "main.py",
    "services/application_log_store.py",
    "services/audit_log_service.py",
]

failed = 0
for rel in files:
    p = ROOT / rel
    if not p.exists():
        print(f"MISSING: {rel}")
        failed += 1
        continue
    try:
        ast.parse(p.read_text(encoding="utf-8"), filename=rel)
        print(f"OK   {rel}")
    except SyntaxError as e:
        print(f"FAIL {rel}: {e}")
        failed += 1

print(f"\n{'PASS' if failed == 0 else 'FAIL'}: {len(files) - failed}/{len(files)}")
sys.exit(0 if failed == 0 else 1)
