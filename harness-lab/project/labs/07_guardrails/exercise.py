#!/usr/bin/env python3
"""[연습] Lab 7 — 반사신경과 가드레일: 루프는 언젠가 멍청한 짓을 한다.

프롬프트에 "조심해"라고 쓰는 건 부탁일 뿐입니다. 가드레일은 하네스 코드 안의 '규칙'이라
모델이 아무리 확신해도 통과할 수 없습니다. 거부할 땐 예외 대신 이유를 문자열로 돌려줘서
모델이 읽고 다른 길을 찾게 합니다.
  1. 보호 경로   : .env, .git/, .ssh/ 등에는 쓰기 금지
  2. 읽고 나서 쓰기: 이미 있는 파일을 이번 세션에 읽지 않고 덮어쓰기 금지
  3. 승인 게이트 : 위험한 명령은 사람에게 물어보고 실행
"""
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.toolbox import execute_tool  # noqa: E402

PROTECTED = (".env", ".git/", ".ssh/", "id_rsa")
DANGEROUS = [r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f", r"\brm\s+-[a-zA-Z]*f[a-zA-Z]*r",
             r"git\s+push\s+.*--force", r"curl[^|]*\|\s*(ba)?sh", r"\bmkfs\b",
             r"\bdd\s+if="]


def is_protected(path):
    p = path.replace("\\", "/")
    return any(mark in p for mark in PROTECTED)


def is_dangerous(command):
    return any(re.search(pat, command) for pat in DANGEROUS)


class Guard:
    def __init__(self, approve=None):
        """approve(command) -> bool : 사람에게 묻는 함수. 기본은 터미널 입력."""
        self.approve = approve or (lambda cmd: input(f"\n⚠️  실행할까요? {cmd} [y/N] ").lower() == "y")
        self.read_paths = set()

    def check(self, name, args):
        """허용이면 None, 거부면 "BLOCKED: <이유>" 문자열을 반환."""
        # TODO(1): 세 규칙을 구현하세요
        raise NotImplementedError("07_guardrails TODO(1)")

    def executor(self, base_execute=execute_tool):
        def execute(name, args):
            verdict = self.check(name, args)
            if verdict:
                return verdict
            result = base_execute(name, args)
            if name == "read_file" and not str(result).startswith("ERROR"):
                self.read_paths.add(os.path.abspath(args["path"]))
            return result
        return execute


if __name__ == "__main__":
    g = Guard(approve=lambda c: False)
    ex = g.executor()
    print(ex("write_file", {"path": ".env", "content": "KEY=1"}))
    print(ex("run_command", {"command": "rm -rf /tmp/whatever"}))
