"""Quick-win: remove noisy console.log calls from realtime.ts.

Strips `console.log(...)` statements inside .subscribe() callbacks and
renames the now-unused `status` / `source` parameter to `_status` /
`_source` (TypeScript's noUnusedParameters convention) so tsc --noEmit
passes.
"""
from pathlib import Path
import re

p = Path(r"F:\eclassroom_day2\frontend\src\lib\realtime.ts")
src = p.read_text(encoding="utf-8")

# Match .subscribe((status) => { ... console.log(...); ... }) blocks
# and:
#   1) strip the console.log line (replace with `void 0;`)
#   2) rename the parameter from `status` to `_status` and from `source`
#      to `_source` so TypeScript doesn't complain about unused params.
# We use re.MULTILINE so the `^` anchor matches per line.
patterns = [
    # .subscribe((status) => {
    (re.compile(r"\.subscribe\(\(status\) => \{"), r".subscribe((_status) => {"),
    # .subscribe((status, source) => {  (if any)
    (re.compile(r"\.subscribe\(\(status, source\) => \{"), r".subscribe((_status, _source) => {"),
    # .subscribe(async (status) => {
    (re.compile(r"\.subscribe\(async \(status\) => \{"), r".subscribe(async (_status) => {"),
    # the .on('subscribe' status handler variants
    (re.compile(r"\.subscribe\(\(source\) => \{"), r".subscribe((_source) => {"),
]

# 1) Rename unused callback parameters
for pat, repl in patterns:
    src, n = pat.subn(repl, src)
    if n:
        print(f"  renamed {n} callback param(s): {pat.pattern!r}")

# 1b) handleChange = (source) => {  (the study-plan realtime handler —
# the only body use of `source` was a console.log we already stripped)
src, n = re.subn(
    r"const handleChange = \(source: string\) => \{",
    r"const handleChange = (_source: string) => {",
    src,
)
if n:
    print(f"  renamed {n} handleChange source param")

# 2) Strip the single-line `console.log(...);` statements. Replace with
#    `void 0;` to preserve statement position inside the block.
log_pattern = re.compile(r"^(\s*)console\.log\((?P<args>.*?)\);?\s*$", re.MULTILINE)


def _strip(match: re.Match) -> str:
    indent = match.group(1)
    return f"{indent}void 0;"


new_src, n = log_pattern.subn(_strip, src)
print(f"stripped {n} console.log calls")

p.write_text(new_src, encoding="utf-8", newline="")
