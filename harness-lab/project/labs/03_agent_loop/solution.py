#!/usr/bin/env python3
"""Lab 3 — 에이전트 루프: 호출 → 실행 → 덧붙이기 → 반복.

Lab 2는 도구를 한 번만 허용했습니다. 실제 작업은 "파일 목록 보기 → 읽기 → 고치기 →
테스트" 처럼 여러 번 필요하죠. 해법은 while 루프 하나입니다.
"에이전트"란 결국 stop_reason 이 tool_use 인 동안 도는 이 루프입니다.

실행:  python labs/03_agent_loop/solution.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.brain import get_brain  # noqa: E402
from common.toolbox import BASE_TOOLS, execute_tool  # noqa: E402

SYSTEM = ("너는 로컬 머신에서 일하는 엔지니어링 에이전트다. "
          "도구로 작업을 끝낸 뒤 한 일을 요약하라.")
MAX_ROUNDS = 50


def run_turn(brain, messages, tools=BASE_TOOLS, system=SYSTEM,
             execute=execute_tool, max_rounds=MAX_ROUNDS, log=print):
    """사용자 한 턴 = 작업이 끝날 때까지 필요한 만큼의 모델/도구 왕복.

    규칙
    1. 매 라운드: 두뇌 호출 → 응답 content 전체를 assistant 메시지로 추가
    2. stop_reason 이 "tool_use" 가 아니면 → 응답 텍스트를 반환하고 끝
    3. 응답 속 '모든' tool_use 를 실행 → tool_result 들을 '하나의' user 메시지로 추가
    4. max_rounds 를 넘으면 멈추고 "[harness]" 로 시작하는 문자열 반환 (폭주 방지)
    """
    # >>> TODO: 위 규칙대로 루프를 구현하세요 (log 로 도구 호출을 출력하면 보기 좋습니다)
    for _ in range(max_rounds):
        response = brain({"system": system, "messages": messages, "tools": tools})
        messages.append({"role": "assistant", "content": response["content"]})
        if response["stop_reason"] != "tool_use":
            return "".join(b["text"] for b in response["content"] if b["type"] == "text")
        results = []
        for b in response["content"]:
            if b["type"] == "tool_use":
                log(f"  [tool] {b['name']}({str(b['input'])[:100]})")
                results.append({"type": "tool_result", "tool_use_id": b["id"],
                                "content": execute(b["name"], b["input"])})
        messages.append({"role": "user", "content": results})
    return f"[harness] MAX_ROUNDS({max_rounds}) 도달 — 이번 턴을 중단합니다."
    # <<< TODO


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
        print(f"\nassistant> {run_turn(brain, messages)}")


if __name__ == "__main__":
    main()
