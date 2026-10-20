#!/usr/bin/env python3
"""Lab 3 따라 해보기 예제.  실행: python labs/03_agent_loop/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 생각 → 행동 → 관찰, 라운드마다 찍어 보기
#: 에이전트 강의에서 말하는 **Thought → Action → Observation** 순환은 코드로는 `while stop_reason == "tool_use"` 한 줄입니다.
#: 아래 두뇌는 대본(ScriptedBrain)대로 말하지만, 도구는 **진짜로** 실행됩니다. 목록 보기 → 파일 읽기 → 답하기, 세 라운드를 지켜보세요.
#? 바꿔 보기: 두 번째 대본의 파일을 `05_대사_통제.md` 로 바꾸면 관찰 결과가 어떻게 달라지나요?
import solution as lab
from common.brain import ScriptedBrain, reply, text, tool_use

script = ScriptedBrain([
    reply(text("어떤 문서가 있는지 먼저 볼게요."),
          tool_use("run_command", {"command": "ls data/procurement/docs"}, id="t1")),
    reply(text("대금지급 규정이 있네요. 읽어 보겠습니다."),
          tool_use("read_file", {"path": "data/procurement/docs/06_대금지급_규정.md"}, id="t2")),
    reply(text("규정상 어음 지급은 하지 않습니다. (06_대금지급_규정.md)")),
])
rounds = 0


def narrated(request):
    global rounds
    rounds += 1
    r = script(request)
    thought = "".join(b["text"] for b in r["content"] if b["type"] == "text")
    print(f"🧠 라운드 {rounds}  생각: {thought}")
    print(f"   stop_reason = {r['stop_reason']}")
    return r


def observed(name, args):
    out = lab.execute_tool(name, args)
    print(f"   🔧 행동: {name}  →  👀 관찰: {out.strip().splitlines()[0]} …")
    return out


messages = [{"role": "user", "content": "어음으로 지급해도 돼?"}]
answer = lab.run_turn(narrated, messages, execute=observed, log=lambda *a: None)
print("\n최종 답:", answer)
print("배열 길이:", len(messages), "(user 1 + 왕복 2번×2 + 마지막 답 1)")

# %% 고집 센 모델과 안전장치 MAX_ROUNDS
#: 모델이 끝없이 도구만 부르면? 루프는 영원히 돌고 요금은 계속 나갑니다. 그래서 **라운드 상한**이 필요합니다. 상한에 걸리면 하네스가 정중하게 턴을 끝냅니다.
#? 바꿔 보기: `max_rounds` 를 5 로 바꿔 보세요.
import solution as lab
from common.brain import ScriptedBrain, reply, tool_use

stubborn = ScriptedBrain([reply(tool_use("run_command", {"command": "echo 한 번만 더"}, id=f"s{i}"))
                          for i in range(10)])
messages = [{"role": "user", "content": "아무거나 해 봐"}]
print(lab.run_turn(stubborn, messages, max_rounds=3,
                   execute=lambda n, a: "ok", log=print))
print("두뇌 호출 횟수:", len(stubborn.requests))

# %% 도구 3개면 코딩 에이전트 (Thorsten Ball 의 'How to Build an Agent' 축소판)
#: Thorsten Ball 은 "에이전트에는 비밀이 없다 — LLM + 루프 + 도구 몇 개"라고 보여 줬습니다. 파일 쓰기와 읽기만으로도 '만들고 → 확인하는' 작업이 됩니다.
#? 바꿔 보기: 대본에 `run_command` 로 `ls` 하는 라운드를 하나 더 넣어 보세요.
import os
import tempfile
import solution as lab
from common.brain import ScriptedBrain, reply, text, tool_use

os.chdir(tempfile.mkdtemp())          # 빈 작업 폴더에서
brain = ScriptedBrain([
    reply(text("메모 파일을 만들게요."),
          tool_use("write_file", {"path": "todo.md", "content": "- [ ] 발주서 검토\n- [ ] 송장 대사"}, id="w1")),
    reply(text("잘 써졌는지 확인합니다."),
          tool_use("run_command", {"command": "cat todo.md"}, id="c1")),
    reply(text("todo.md 에 할 일 2개를 적었습니다.")),
])
messages = [{"role": "user", "content": "할 일 메모 파일 만들어 줘"}]
print(lab.run_turn(brain, messages))
print("\n실제로 만들어진 파일:\n" + open("todo.md", encoding="utf-8").read())
