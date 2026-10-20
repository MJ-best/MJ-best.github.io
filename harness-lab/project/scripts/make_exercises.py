#!/usr/bin/env python3
"""solution.py 의 '# >>> TODO ... # <<< TODO' 구간을 비워 exercise.py 를 만든다.
(이미 있는 exercise.py 는 덮어쓰지 않음. --force 로 강제)"""
import glob
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
force = "--force" in sys.argv

for sol in sorted(glob.glob(os.path.join(ROOT, "labs", "*", "solution.py"))):
    lab = os.path.basename(os.path.dirname(sol))
    out, skipping, n = [], False, 0
    for line in open(sol, encoding="utf-8").read().splitlines():
        m = re.match(r"^(\s*)# >>> TODO:?\s*(.*)$", line)
        if m:
            indent, hint = m.groups()
            n += 1
            out.append(f"{indent}# TODO({n}): {hint}")
            if indent:  # 함수 안: 실행되면 바로 알 수 있게
                out.append(f'{indent}raise NotImplementedError("{lab} TODO({n})")')
            skipping = True
            continue
        if re.match(r"^\s*# <<< TODO", line):
            skipping = False
            continue
        if not skipping:
            out.append(line)
    ex = os.path.join(os.path.dirname(sol), "exercise.py")
    if os.path.exists(ex) and not force:
        print(f"skip  {lab}/exercise.py (이미 있음)")
        continue
    text = "\n".join(out) + "\n"
    text = text.replace('"""Lab', '"""[연습] Lab', 1)
    open(ex, "w", encoding="utf-8").write(text)
    print(f"made  {lab}/exercise.py  (TODO {n}개)")
