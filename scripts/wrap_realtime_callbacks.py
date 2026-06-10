"""Wrap unprotected realtime callbacks in safeCallback().

Walks realtime.ts line by line, finds every `.on('postgres_changes', ...)`
and inspects the next non-whitespace token to see if the third argument
is an inline arrow function `(payload) => { ... }` (possibly with async).
If so, wraps it in safeCallback('name', ...). The name is derived from
the nearest preceding `.channel(` call.

The previous version failed because the arrow function and its body are
on separate lines. This version tracks brace depth across lines.
"""
from pathlib import Path
import re

p = Path(r"F:\eclassroom_day2\frontend\src\lib\realtime.ts")
src = p.read_text(encoding="utf-8")

lines = src.split("\n")
out: list[str] = []
i = 0
wraps = 0
skipped = 0

while i < len(lines):
    line = lines[i]

    # Detect `.on(` start with `postgres_changes` somewhere on this line.
    is_on_pg = False
    if ".on(" in line and "postgres_changes" in line:
        is_on_pg = True
    elif ".on(" in line:
        # The .on( might be on its own line, and 'postgres_changes' on
        # the next. Look ahead.
        if i + 1 < len(lines) and "postgres_changes" in lines[i + 1]:
            is_on_pg = True

    if not is_on_pg:
        out.append(line)
        i += 1
        continue

    # Find the start of the callback (the 3rd argument). The `.on(`
    # call has the form:
    #   .on(
    #     'postgres_changes',
    #     { ... config ... },
    #     (payload) => {
    #       ...
    #     }
    #   )
    # We need to scan forward until we see the arrow function, then
    # find its matching closing brace.

    # First, append the `.on(` line.
    out.append(line)
    j = i + 1

    # Track brace depth of the `.on(` call so we know when we exit it.
    paren_depth = line.count("(") - line.count(")")

    # Look for the arrow function start.
    arrow_start_line = -1
    arrow_start_col = -1
    while j < len(lines):
        # Accumulate paren depth so we don't match an arrow inside the
        # config object.
        paren_depth += lines[j].count("(") - lines[j].count(")")
        m = re.search(
            r"(?:async\s+)?\(\s*payload[^)]*\)\s*=>\s*\{",
            lines[j],
        )
        if m and paren_depth >= 1:
            arrow_start_line = j
            arrow_start_col = m.start()
            break
        # If we exit the .on() call (paren_depth returns to 0 and we
        # haven't seen the arrow), bail.
        if paren_depth <= 0 and j > i + 2:
            break
        j += 1

    if arrow_start_line < 0:
        # Couldn't find the arrow — append remaining lines untouched.
        for k in range(i + 1, len(lines)):
            out.append(lines[k])
        break

    # Check if already wrapped (look back 1-3 lines for safeCallback).
    already = False
    for back in range(arrow_start_line - 1, max(arrow_start_line - 4, 0) - 1, -1):
        if "safeCallback(" in lines[back]:
            already = True
            break
    if already:
        # Append lines up through arrow_start_line unchanged and move on.
        for k in range(i + 1, arrow_start_line + 1):
            out.append(lines[k])
        i = arrow_start_line + 1
        skipped += 1
        continue

    # Find the matching `}` for the arrow function body.
    depth = 0
    started = False
    end_line = -1
    k = arrow_start_line
    while k < len(lines):
        for ch in lines[k]:
            if ch == "{":
                depth += 1
                started = True
            elif ch == "}":
                depth -= 1
                if started and depth == 0:
                    end_line = k
                    break
        if end_line >= 0:
            break
        k += 1
    if end_line < 0:
        for kk in range(i + 1, len(lines)):
            out.append(lines[kk])
        break

    # Derive a channel-derived name. Walk back from i to find `.channel(`.
    name = "rt"
    for back in range(i, max(i - 40, 0) - 1, -1):
        cm = re.search(r"\.channel\(\s*[`'\"]([^`'\"]+)[`'\"]\s*\)", lines[back])
        if cm:
            name = cm.group(1).replace(":", "-").replace(" ", "")
            # Cap to a reasonable length.
            if len(name) > 40:
                name = name[:40]
            break

    # Insert `safeCallback('NAME', ` just before the arrow function on
    # lines[arrow_start_line].
    arrow_m = re.search(
        r"((?:async\s+)?\(\s*payload[^)]*\)\s*=>\s*\{)",
        lines[arrow_start_line],
    )
    if not arrow_m:
        for kk in range(i + 1, len(lines)):
            out.append(lines[kk])
        break
    new_arrow_line = (
        lines[arrow_start_line][: arrow_m.start()]
        + f"safeCallback('{name}', "
        + lines[arrow_start_line][arrow_m.start() :]
    )
    lines[arrow_start_line] = new_arrow_line

    # Now find the matching `}` again (the arrow line changed but the
    # end_line should still be the same). Append a `)` after the
    # closing `}` on lines[end_line].
    # Walk back from the end of lines[end_line] to find the position
    # just after the `}`.
    end_text = lines[end_line]
    # Find the last `}` in the line.
    last_brace = end_text.rfind("}")
    if last_brace < 0:
        for kk in range(i + 1, len(lines)):
            out.append(lines[kk])
        break
    # Insert `)` right after the `}`.
    new_end = end_text[: last_brace + 1] + ")" + end_text[last_brace + 1 :]
    lines[end_line] = new_end

    # Append all lines from i+1 to end_line (inclusive) to out.
    for k in range(i + 1, end_line + 1):
        out.append(lines[k])

    wraps += 1
    i = end_line + 1

p.write_text("\n".join(out), encoding="utf-8", newline="")
print(f"wrapped {wraps} callbacks, skipped {skipped} already-wrapped")
