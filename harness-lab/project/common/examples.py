"""labs/*/examples.py 를 칸(cell) 단위로 읽고 실행하는 도구.

칸 형식:
    # %% 제목
    #: 설명 (마크다운 한 줄, 빈 '#:' 는 문단 나눔)
    #? 바꿔 보기 과제
    코드…
"""
import contextlib
import io
import os
import re
import subprocess
import sys
import traceback

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def parse(path):
    text = open(path, encoding="utf-8").read()
    parts = re.split(r"^# %% ", text, flags=re.M)[1:]
    cells = []
    for part in parts:
        lines = part.splitlines()
        title, prose, tries, code = lines[0].strip(), [], [], []
        for line in lines[1:]:
            if line.startswith("#:") and not code:
                prose.append(line[2:].strip())
            elif line.startswith("#?") and not code:
                tries.append(line[2:].strip())
            else:
                code.append(line)
        cells.append({"title": title, "prose": prose, "try": tries,
                      "code": "\n".join(code).strip("\n") + "\n"})
    return cells


def run_cell(lab_dir, code):
    """칸 하나를 '새 파이썬 프로세스'에서 실행하고 출력(stdout+stderr)을 돌려준다."""
    prelude = (f"import os, sys\nsys.path[:0] = [{lab_dir!r}, {ROOT!r}]\nos.chdir({ROOT!r})\n"
               "os.environ.setdefault('LAB_IMPL', 'solution')\n")
    env = dict(os.environ, HARNESS_BRAIN="fake", PYTHONHASHSEED="0", PYTHONIOENCODING="utf-8")
    env.pop("HARNESS_DEBUG", None)
    r = subprocess.run([sys.executable, "-c", prelude + code], capture_output=True,
                       text=True, env=env, timeout=60)
    return r.returncode, (r.stdout + r.stderr).rstrip() + "\n"


def run_cell_inprocess(code):
    """(브라우저용) 현재 프로세스에서 실행하고 출력을 캡처한다."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        try:
            exec(compile(code, "<예제>", "exec"), {"__name__": "__example__"})
        except BaseException:  # noqa: BLE001
            traceback.print_exc()
    return buf.getvalue()
