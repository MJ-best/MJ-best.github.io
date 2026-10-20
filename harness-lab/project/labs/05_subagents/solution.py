#!/usr/bin/env python3
"""Lab 5 — 서브에이전트 = '새 배열'로 같은 루프를 한 번 더 돌리는 것.

한 배열에 모든 탐색 과정을 쌓으면 금방 찹니다. 서브에이전트는
빈 배열에서 시작해 일하고, 부모에게는 '최종 보고서 한 줄'만 돌려줍니다.
부모의 배열에는 중간 과정이 전혀 남지 않습니다 (컨텍스트 포크).

실행:  python labs/05_subagents/solution.py   (FakeBrain: 'ask read README.md')
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.brain import get_brain  # noqa: E402
from common.loop import printer, run_loop  # noqa: E402
from common.toolbox import BASE_TOOLS, execute_tool  # noqa: E402

SYSTEM = "너는 엔지니어링 에이전트다. 독립적인 조사는 agent 도구로 위임하라."
SUB_SYSTEM = "너는 집중형 서브에이전트다. 도구로 작업을 끝내고, 파일 경로를 인용한 독립적인 보고서로 마무리하라."

AGENT_TOOL = {
    "name": "agent",
    "description": "독립적인 하위 작업을 새 컨텍스트의 서브에이전트에게 맡기고 보고서를 받는다.",
    "input_schema": {"type": "object",
                     "properties": {"task": {"type": "string"}},
                     "required": ["task"]},
}
PARENT_TOOLS = BASE_TOOLS + [AGENT_TOOL]


def run_subagent(brain, task, tools=BASE_TOOLS, execute=execute_tool):
    """새 배열 [user: task] 로 SUB_SYSTEM 루프를 돌리고 최종 텍스트만 반환.
    서브에이전트의 도구 목록에는 agent 가 없어야 한다 (무한 위임 방지)."""
    # >>> TODO: 새 messages 를 만들고 run_loop(brain, messages, tools, SUB_SYSTEM, execute) 를 호출하세요
    sub_tools = [t for t in tools if t["name"] != "agent"]
    messages = [{"role": "user", "content": task}]
    return run_loop(brain, messages, sub_tools, SUB_SYSTEM, execute=execute)
    # <<< TODO


def make_executor(brain):
    """부모용 실행기: agent 는 서브에이전트로, 나머지는 기본 도구로 보낸다."""
    # >>> TODO: execute(name, args) 함수를 만들어 반환하세요
    def execute(name, args):
        if name == "agent":
            return run_subagent(brain, args["task"])
        return execute_tool(name, args)
    return execute
    # <<< TODO


def run_turn(brain, messages, on_event=None):
    return run_loop(brain, messages, PARENT_TOOLS, SYSTEM,
                    execute=make_executor(brain), on_event=on_event)


def main():
    brain, messages = get_brain(), []
    while True:
        try:
            user_text = input("\nyou> ").strip()
        except EOFError:
            break
        if user_text in ("/quit", ""):
            break
        messages.append({"role": "user", "content": user_text})
        run_turn(brain, messages, on_event=printer)


if __name__ == "__main__":
    main()
