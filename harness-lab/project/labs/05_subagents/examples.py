#!/usr/bin/env python3
"""Lab 5 따라 해보기 예제.  실행: python labs/05_subagents/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 조사는 인턴에게, 나는 보고서만
#: **비유** — 팀장이 서류 더미를 직접 다 읽으면 책상(컨텍스트)이 서류로 덮입니다. 인턴에게 "지급 관련 규정 찾아서 한 줄로 보고해 줘"라고 맡기면, 팀장 책상엔 **보고서 한 장**만 남습니다.
#: 아래 표에서 서브에이전트는 문서를 읽느라 배열이 커지지만, 부모 배열은 작게 유지되는 걸 보세요.
#? 바꿔 보기: 서브에이전트가 파일을 하나 더 읽게 대본을 늘려 보세요. 부모 배열 길이는 그대로입니다.
import solution as lab
from common.brain import ScriptedBrain, reply, text, tool_use
from common.show import show

script = ScriptedBrain([
    # 부모: 직접 읽지 않고 위임
    reply(tool_use("agent", {"task": "data/procurement/docs 에서 '지급' 규정 파일을 찾아 핵심을 한 줄로 보고하라"}, id="p1")),
    # 서브: 목록 → 읽기 → 보고
    reply(tool_use("run_command", {"command": "ls data/procurement/docs"}, id="s1")),
    reply(tool_use("read_file", {"path": "data/procurement/docs/06_대금지급_규정.md"}, id="s2")),
    reply(text("보고: 06_대금지급_규정.md — 삼자대사가 끝난 송장만 계좌로 지급, 어음 불가.")),
    # 부모: 보고서로 답변
    reply(text("어음 지급은 안 됩니다. 삼자대사가 끝난 송장만 계좌 송금합니다.")),
])
log = []


def watched(request):
    who = "서브" if "서브에이전트" in request["system"] else "부모"
    size = len(str(request["messages"]))
    log.append((who, len(request["messages"]), size))
    return script(request)


messages = [{"role": "user", "content": "어음으로 줘도 돼?"}]
print("답:", lab.run_turn(watched, messages))
print("\n호출  누구   메시지 수   배열 크기(글자)")
for i, (who, n, size) in enumerate(log, 1):
    print(f"{i:>3}   {who}   {n:>6}      {size:>7,}")
show(messages, "부모 배열 — 서브의 중간 과정은 없다")

# %% 위임 메시지는 '맥락 없이도' 통해야 한다
#: 서브에이전트는 **빈 배열**에서 시작합니다. 부모가 무슨 대화를 했는지 모릅니다. 그래서 "그거 찾아줘" 같은 위임은 실패합니다. 아래는 서브에이전트가 실제로 받는 첫 요청입니다.
import solution as lab
from common.brain import ScriptedBrain, reply, text

for task in ["그거 찾아줘", "data/procurement/docs 에서 '검수' 기준 파일을 찾아 판정 종류를 보고하라"]:
    sub = ScriptedBrain([reply(text("…"))])
    lab.run_subagent(sub, task)
    first = sub.requests[0]
    print("서브가 받은 messages:", first["messages"])
    print("서브가 가진 도구   :", [t["name"] for t in first["tools"]], "← agent 없음(무한 위임 방지)\n")
