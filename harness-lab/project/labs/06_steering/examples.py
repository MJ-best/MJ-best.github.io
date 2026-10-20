#!/usr/bin/env python3
"""Lab 6 따라 해보기 예제.  실행: python labs/06_steering/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 모니터에 붙인 포스트잇: todo 목록
#: **비유** — 긴 일을 할 때 모니터에 포스트잇을 붙여 두면 딴 길로 새지 않죠. 하네스는 미완료 할 일이 있는 동안 **매 라운드** 포스트잇을 다시 보여줍니다.
#? 바꿔 보기: 모든 항목 앞에 `x ` 를 붙이면 리마인더가 사라집니다.
import solution as lab

s = lab.Steering()
print(s.todo_write("x 규정 문서 목록 보기\n대금지급 규정 읽기\n답변 쓰기"))
blocks = [{"type": "tool_result", "tool_use_id": "t1", "content": "(도구 결과)"}]
s.inject(blocks)
print("\n다음 user 메시지의 블록들:")
for b in blocks:
    print("-", b.get("text") or f"tool_result[{b['tool_use_id']}]")

# %% 작업 도중에 끼어들기
#: 에이전트가 파일을 읽는 동안 사용자가 "결론부터 말해 줘"라고 덧붙였습니다. 루프를 멈추지 않고, 다음 라운드의 tool_result **뒤에** 리마인더로 실어 보냅니다. 두뇌는 그걸 읽고 답 형식을 바꿉니다.
#? 바꿔 보기: `s.steer(...)` 줄을 지우면 두뇌의 답이 어떻게 바뀌나요?
import json
import solution as lab
from common.brain import ScriptedBrain, reply, text, tool_use
from common.loop import run_loop
from common.show import show

s = lab.Steering()


def obeying(request):
    last = json.dumps(request["messages"][-1], ensure_ascii=False)
    if "결론부터" in last:
        return reply(text("결론: 어음 지급 불가. (이유: 규정 6조 계좌 송금 원칙)"))
    return reply(text("규정을 살펴보니 지급은 계좌 송금을 원칙으로 하며 … 따라서 어음은 안 됩니다."))


brain = ScriptedBrain([reply(tool_use("read_file", {"path": "data/procurement/docs/06_대금지급_규정.md"}, id="r1")),
                       obeying])


def tool_while_user_types(name, args):
    s.steer("결론부터 말해 줘")            # ← 도구가 도는 사이 사용자가 입력
    return "(규정 본문)"


messages = [{"role": "user", "content": "어음 돼?"}]
print(run_loop(brain, messages, [], "sys", execute=tool_while_user_types, inject=s.inject))
show(messages)
