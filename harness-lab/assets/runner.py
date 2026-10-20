"""브라우저(Pyodide) 안에서 랩 테스트를 돌리는 채점기.

파일은 JS 가 /harness-lab 아래에 미리 써 둔다. 여기서는
  1) 브라우저에 없는 subprocess 를 흉내 내고 (echo/ls/cat 정도만)
  2) 이전 실행의 모듈 캐시를 지운 뒤
  3) unittest 를 돌려 결과를 dict 로 돌려준다.
"""
import io
import json
import os
import shlex
import subprocess
import sys
import unittest

ROOT = "/harness-lab"


def _fake_run(cmd, shell=False, capture_output=False, text=False, timeout=None, **kw):
    parts = shlex.split(cmd) if isinstance(cmd, str) else list(cmd)
    out, err = "", ""
    try:
        if not parts:
            pass
        elif parts[0] == "echo":
            out = " ".join(parts[1:]) + "\n"
        elif parts[0] == "ls":
            target = next((p for p in parts[1:] if not p.startswith("-")), ".")
            out = "\n".join(sorted(os.listdir(target))) + "\n"
        elif parts[0] == "cat":
            out = "".join(open(p, encoding="utf-8").read() for p in parts[1:])
        elif parts[0] == "pwd":
            out = os.getcwd() + "\n"
        else:
            err = f"(브라우저 실습 환경: '{parts[0]}' 명령은 지원하지 않습니다. echo/ls/cat/pwd 만 가능)\n"
    except Exception as e:  # noqa: BLE001
        err = f"{type(e).__name__}: {e}\n"
    return subprocess.CompletedProcess(parts, 0 if not err else 1, out, err)


subprocess.run = _fake_run


def run_snippet(lab, code):
    """'따라 해보기' 예제 한 칸을 실행하고 출력 문자열을 돌려준다 (정답 구현 사용)."""
    _reset_modules()
    os.environ.update(LAB_IMPL="solution", HARNESS_BRAIN="fake")
    os.environ.pop("HARNESS_DEBUG", None)
    sys.path[:0] = [f"{ROOT}/labs/{lab}", ROOT]
    os.chdir(ROOT)
    from common.examples import run_cell_inprocess
    return run_cell_inprocess(code)


def _reset_modules():
    for name in list(sys.modules):
        if (name in ("test_lab", "solution", "exercise", "mini_harness")
                or name == "common" or name.startswith("common.")
                or name.startswith(("cap_", "lab_")) or name.endswith(("_exercise", "_solution"))):
            del sys.modules[name]
    sys.path[:] = [p for p in sys.path if not p.startswith(ROOT)]


class _Result(unittest.TextTestResult):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.records = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.records.append({"name": test._testMethodName, "ok": True})

    def _bad(self, test, err, kind):
        name = getattr(test, "_testMethodName", None) or f"준비 단계 오류 ({test})"
        self.records.append({"name": name, "ok": False, "kind": kind,
                             "detail": self._exc_info_to_string(err, test)})

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._bad(test, err, "FAIL")

    def addError(self, test, err):
        super().addError(test, err)
        self._bad(test, err, "ERROR")


def run_lab(lab, impl="exercise"):
    _reset_modules()
    os.environ.update(LAB_TARGET=impl, LAB_IMPL=impl, HARNESS_BRAIN="fake")
    os.environ.pop("HARNESS_DEBUG", None)
    lab_dir = f"{ROOT}/labs/{lab}"
    sys.path.insert(0, lab_dir)
    os.chdir(lab_dir)
    stream = io.StringIO()
    try:
        suite = unittest.defaultTestLoader.loadTestsFromName("test_lab")
    except BaseException:  # noqa: BLE001  문법 오류 등 → 결과로 보여준다
        import traceback
        detail = traceback.format_exc()
        return json.dumps({"ok": False, "total": 1, "passed": 0, "log": detail,
                           "tests": [{"name": "코드 불러오기", "ok": False, "kind": "ERROR",
                                      "detail": detail}]}, ensure_ascii=False)
    runner = unittest.TextTestRunner(stream=stream, verbosity=2, resultclass=_Result)
    res = runner.run(suite)
    recs = res.records
    return json.dumps({"ok": res.wasSuccessful() and res.testsRun > 0, "total": len(recs),
                       "passed": sum(1 for r in recs if r["ok"]),
                       "tests": res.records, "log": stream.getvalue()}, ensure_ascii=False)
