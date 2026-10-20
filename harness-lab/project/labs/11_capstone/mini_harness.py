#!/usr/bin/env python3
"""Lab 11 — 캡스톤: 지금까지 만든 패치를 한 몸에 조립한 미니 하네스.

  Lab 1  배열 = 세션 파일              Lab 6  리마인더 큐 + todo
  Lab 2  도구 스키마 + 디스패치         Lab 7  가드레일 (보호 경로·읽고 쓰기·승인)
  Lab 3  에이전트 루프                  Lab 8  요청 캡처 + 캐시 활력징후
  Lab 4  결과 자르기 + 캐시 브레이크포인트 Lab 9  RAG 검색 도구
  Lab 5  서브에이전트                   Lab 10 온톨로지 전체 주입 + 조회 도구

실행:
  python labs/11_capstone/mini_harness.py                 # 세션 저장 없이
  python labs/11_capstone/mini_harness.py session.json    # 세션 이어하기
  HARNESS_DEBUG=1 python labs/11_capstone/mini_harness.py # 요청 캡처 → harness_debug.jsonl
  LAB_IMPL=exercise ...                                   # 내가 푼 exercise.py 로 조립

대화 중 명령:  /todo  /dump  /tokens  /steer <말>  /quit
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
from common.brain import get_brain  # noqa: E402
from common.loop import printer, run_loop  # noqa: E402
from common.toolbox import BASE_TOOLS, execute_tool  # noqa: E402

IMPL = os.environ.get("LAB_IMPL", "solution")


def load_lab(dirname):
    path = os.path.join(ROOT, "labs", dirname, f"{IMPL}.py")
    spec = importlib.util.spec_from_file_location(f"cap_{dirname}_{IMPL}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


L1 = load_lab("01_array")
L4 = load_lab("04_context_budget")
L5 = load_lab("05_subagents")
L6 = load_lab("06_steering")
L7 = load_lab("07_guardrails")
L8 = load_lab("08_debugging")
L9 = load_lab("09_rag")
L10 = load_lab("10_ontology")

BASE_SYSTEM = (
    "너는 사용자의 머신에서 일하는 엔지니어링·구매 업무 에이전트다.\n"
    "도구로 작업을 끝낸 뒤 한 일을 요약하라. 여러 단계 작업은 todo_write 로 계획을 관리하라.\n"
    "사내 규정 질문은 search_docs 로 근거를 찾고 출처 id 를 인용하라.\n"
    "user 메시지 안의 <system-reminder> 는 하네스(너의 몸)가 넣은 것이니 환경 사실로 신뢰하라.")


class MiniHarness:
    def __init__(self, brain, approve=None, memory_path="AGENT.md"):
        if os.environ.get("HARNESS_DEBUG") == "1":
            brain = L8.CapturingBrain(brain, "harness_debug.jsonl")       # Lab 8
        self.brain = brain
        self.steering = L6.Steering()                                      # Lab 6
        self.guard = L7.Guard(approve=approve)                             # Lab 7
        self.index = L9.Index(L9.load_docs())                              # Lab 9
        self.onto = L10.load_ontology()                                    # Lab 10
        self.system = (L10.build_system(BASE_SYSTEM, self.onto)            # Lab 10 (1단계)
                       + L4.load_memory(memory_path))                      # Lab 4
        self.tools = (BASE_TOOLS + [L5.AGENT_TOOL, L6.TODO_TOOL,
                                    L9.SEARCH_TOOL, L10.ONTOLOGY_TOOL])
        self.last_usage = {}

    # --- 두뇌 호출을 감싸 캐시 브레이크포인트를 붙이고 usage 를 기록 (Lab 4, 8)
    def _call(self, request):
        response = self.brain(L4.with_cache_breakpoint(request))
        self.last_usage = response.get("usage", {})
        return response

    # --- 도구 실행 파이프라인: 가드 → (todo|agent|search|ontology|기본) → 자르기
    def execute(self, name, args):
        if name == "agent":                                                # Lab 5
            sub_tools = [t for t in self.tools if t["name"] != "agent"]
            msgs = [{"role": "user", "content": args["task"]}]
            return L4.truncate(run_loop(self._call, msgs, sub_tools, L5.SUB_SYSTEM,
                                        execute=self.execute))
        base = L7.Guard.executor(self.guard, execute_tool)                 # Lab 7
        base = L9.make_search_executor(self.index, base)                   # Lab 9
        base = L10.make_ontology_executor(self.onto, base)                 # Lab 10 (2단계)
        base = self.steering.executor(base)                                # Lab 6
        return L4.truncate(str(base(name, args)))                          # Lab 4

    def run_turn(self, messages, on_event=printer):
        return run_loop(self._call, messages, self.tools, self.system,
                        execute=self.execute, inject=self.steering.inject,
                        on_event=on_event)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    h = MiniHarness(get_brain())
    messages = L1.load_session(path) if path else []
    print("미니 하네스 준비 완료. 명령: /todo /dump /tokens /steer <말> /quit")
    while True:
        try:
            user_text = input("\nyou> ").strip()
        except EOFError:
            break
        if user_text in ("/quit", ""):
            break
        if user_text == "/todo":
            print(h.steering.render_todos() or "(할 일 없음)")
            continue
        if user_text == "/dump":
            print(json.dumps(messages, ensure_ascii=False, indent=2)[-4000:])
            continue
        if user_text == "/tokens":
            print(f"배열 ~{L4.estimate_tokens(messages)} 토큰, 시스템 ~{L4.estimate_tokens(h.system)} 토큰, "
                  f"마지막 캐시 적중률 {L8.cache_hit_ratio(h.last_usage):.0%}")
            continue
        if user_text.startswith("/steer "):
            h.steering.steer(user_text[7:])
            print("(다음 라운드에 전달됩니다)")
            continue
        messages.append({"role": "user", "content": user_text})
        h.run_turn(messages)
        if path:
            L1.save_session(path, messages)


if __name__ == "__main__":
    main()
