"""기본 도구 상자 — Lab 2의 참고 구현. Lab 3 이후 랩들이 가져다 씁니다.

도구 = (1) 모델에게 보여줄 JSON 스키마  +  (2) 실제로 실행할 파이썬 함수.
"""
import os
import subprocess


def _schema(**props):
    """_schema(path="", content="") → 문자열 속성들. 값이 '?'면 선택 항목."""
    return {"type": "object",
            "properties": {k: {"type": "string"} for k in props},
            "required": [k for k, v in props.items() if v != "?"]}


BASE_TOOLS = [
    {"name": "read_file",
     "description": "텍스트 파일을 읽어 내용을 반환한다.",
     "input_schema": _schema(path="")},
    {"name": "write_file",
     "description": "파일을 만들거나 덮어쓴다.",
     "input_schema": _schema(path="", content="")},
    {"name": "run_command",
     "description": "셸 명령을 실행하고 stdout+stderr를 반환한다.",
     "input_schema": _schema(command="")},
]


def read_file(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_file(path, content):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"wrote {len(content)} chars to {path}"


def run_command(command, timeout=120):
    out = subprocess.run(command, shell=True, capture_output=True,
                         text=True, timeout=timeout)
    return (out.stdout + out.stderr) or "(no output)"


HANDLERS = {"read_file": read_file, "write_file": write_file,
            "run_command": run_command}


def execute_tool(name, args):
    """도구를 실행한다. 실패해도 예외를 던지지 않고 'ERROR: ...' 문자열을 돌려준다.
    (에러도 모델이 읽고 대응할 수 있는 '관찰'이기 때문)"""
    fn = HANDLERS.get(name)
    if fn is None:
        return f"ERROR: unknown tool {name}"
    try:
        return fn(**args)
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"
