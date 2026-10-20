#!/usr/bin/env python3
"""Lab 7 따라 해보기 예제.  실행: python labs/07_guardrails/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 확신에 찬 사고 3종 세트
#: 모델은 악의가 없어도 "설정 정리할게요" 하며 `.env` 를 덮어쓰거나, 읽지도 않은 파일을 추측으로 통째로 다시 씁니다. 프롬프트의 "조심해"는 부탁이지만, 가드레일은 **코드로 된 규칙**입니다.
#? 바꿔 보기: `approve=lambda c: True` 로 바꾸면 세 번째 명령은 통과합니다(실제로 지워지니 빈 폴더에서만!).
import os
import tempfile
import solution as lab

os.chdir(tempfile.mkdtemp())
open("발주목록.csv", "w").write("PO-001,볼트,100\nPO-002,너트,200\n")

guard = lab.Guard(approve=lambda cmd: print(f"   🙋 사람에게 확인 요청: {cmd} → 거절") or False)
run = guard.executor()
attempts = [
    ("write_file", {"path": ".env", "content": "API_KEY="}),
    ("write_file", {"path": "발주목록.csv", "content": "PO-001,볼트,100\n"}),
    ("run_command", {"command": "rm -rf ./*"}),
]
for name, args in attempts:
    print(f"{name}({list(args.values())[0]}) → {run(name, args)}")

print("\n발주목록.csv 는 무사합니다:", open("발주목록.csv").read().count("\n"), "줄")

# %% 거부 이유를 읽고 스스로 고치는 모델
#: 가드레일이 예외로 하네스를 멈추면 작업이 끝나 버립니다. 대신 `BLOCKED: 이유` 를 돌려주면, 모델이 읽고 **올바른 순서(읽기 → 쓰기)** 로 다시 시도합니다.
import os
import tempfile
import solution as lab
from common.brain import ScriptedBrain, reply, text, tool_use
from common.loop import run_loop
from common.show import show

os.chdir(tempfile.mkdtemp())
open("단가표.txt", "w").write("볼트 120원\n너트 80원\n")
guard = lab.Guard(approve=lambda c: False)

brain = ScriptedBrain([
    reply(tool_use("write_file", {"path": "단가표.txt", "content": "볼트 130원\n"}, id="w1")),
    reply(text("먼저 읽어야 하는군요."), tool_use("read_file", {"path": "단가표.txt"}, id="r1")),
    reply(tool_use("write_file", {"path": "단가표.txt", "content": "볼트 130원\n너트 80원\n"}, id="w2")),
    reply(text("볼트 단가만 130원으로 고쳤습니다. 너트는 그대로입니다.")),
])
messages = [{"role": "user", "content": "볼트 단가 130원으로 올려줘"}]
print(run_loop(brain, messages, [], "sys", execute=guard.executor()))
show(messages)
print("최종 파일:", open("단가표.txt").read().replace("\n", " / "))
