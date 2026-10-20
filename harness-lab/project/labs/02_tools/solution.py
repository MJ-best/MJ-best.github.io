#!/usr/bin/env python3
"""Lab 2 — 도구 = JSON 스키마 + 함수 디스패치.

두뇌는 세상을 만질 수 없습니다. 할 수 있는 건 "이 도구를 이 인자로 불러줘"라는
tool_use 블록을 '쓰는' 것뿐. 실제 실행은 하네스(몸)가 합니다.

실행:  python labs/02_tools/solution.py      (FakeBrain에서 'read README.md' 입력해보기)
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.brain import get_brain  # noqa: E402

SYSTEM = "너는 도구를 쓸 수 있는 조수다. 필요하면 도구를 호출하라."

TOOLS = [
    {"name": "read_file",
     "description": "텍스트 파일을 읽어 내용을 반환한다.",
     "input_schema": {"type": "object",
                      "properties": {"path": {"type": "string"}},
                      "required": ["path"]}},
    {"name": "run_command",
     "description": "셸 명령을 실행하고 stdout+stderr를 반환한다.",
     "input_schema": {"type": "object",
                      "properties": {"command": {"type": "string"}},
                      "required": ["command"]}},
]

# >>> TODO: write_file 도구 스키마를 TOOLS 에 추가하세요 (path, content 둘 다 필수 문자열)
TOOLS.append(
    {"name": "write_file",
     "description": "파일을 만들거나 덮어쓴다.",
     "input_schema": {"type": "object",
                      "properties": {"path": {"type": "string"},
                                     "content": {"type": "string"}},
                      "required": ["path", "content"]}})
# <<< TODO


def _read_file(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def _write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"wrote {len(content)} chars to {path}"


def _run_command(command):
    out = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=120)
    return (out.stdout + out.stderr) or "(no output)"


HANDLERS = {"read_file": _read_file, "write_file": _write_file,
            "run_command": _run_command}


def execute_tool(name, args):
    """디스패치. 규칙:
    - 모르는 도구  → "ERROR: unknown tool <name>"
    - 실행 중 예외 → 예외를 던지지 말고 "ERROR: ..." 로 시작하는 문자열 반환
    """
    # >>> TODO: HANDLERS 로 디스패치하고, 위 규칙대로 에러를 문자열로 바꾸세요
    fn = HANDLERS.get(name)
    if fn is None:
        return f"ERROR: unknown tool {name}"
    try:
        return fn(**args)
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"
    # <<< TODO


def tool_results_for(response):
    """응답 속 '모든' tool_use 블록을 실행해서 tool_result 블록 리스트를 만든다.
    각 결과의 tool_use_id 는 해당 tool_use 블록의 id 와 같아야 한다."""
    # >>> TODO: {"type": "tool_result", "tool_use_id": ..., "content": ...} 리스트를 반환하세요
    return [{"type": "tool_result", "tool_use_id": b["id"],
             "content": execute_tool(b["name"], b["input"])}
            for b in response["content"] if b["type"] == "tool_use"]
    # <<< TODO


def ask_with_tools(brain, messages, user_text):
    """도구를 '딱 한 번만' 허용하는 버전. 첫 응답이 도구를 원하면 실행하고
    결과를 user 메시지로 붙여 한 번 더 호출한다. → 왜 이걸로 부족한지가 Lab 3의 출발점."""
    messages.append({"role": "user", "content": user_text})
    request = {"system": SYSTEM, "messages": messages, "tools": TOOLS}
    response = brain(request)
    messages.append({"role": "assistant", "content": response["content"]})
    if response["stop_reason"] == "tool_use":
        messages.append({"role": "user", "content": tool_results_for(response)})
        response = brain(request)
        messages.append({"role": "assistant", "content": response["content"]})
    return "".join(b["text"] for b in response["content"] if b["type"] == "text")


def main():
    brain, messages = get_brain(), []
    while True:
        try:
            user_text = input("\nyou> ").strip()
        except EOFError:
            break
        if user_text in ("/quit", ""):
            break
        print(f"\nassistant> {ask_with_tools(brain, messages, user_text)}")


if __name__ == "__main__":
    main()
