#!/usr/bin/env python3
"""Lab 11 따라 해보기 예제.  실행: python labs/11_capstone/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)
os.environ.setdefault("LAB_IMPL", "solution")

# %% 한 턴 해부: 모든 패치가 한꺼번에 일하는 장면
#: 질문 하나에 todo(Lab 6) → 문서 검색(Lab 9) → 가드레일 거부(Lab 7) → 온톨로지 조회(Lab 10) → 답변이 차례로 일어납니다. 각 줄 앞의 번호가 어느 랩의 부품인지 보세요.
#? 바꿔 보기: 대본에서 `.env` 쓰기를 `memo.txt` 쓰기로 바꾸면 가드레일이 통과시킵니다.
import json
import mini_harness as mh
from common.brain import ScriptedBrain, reply, text, tool_use

brain = ScriptedBrain([
    reply(tool_use("todo_write", {"items": "규정 찾기\n용어 확인\n답변"}, id="a")),
    reply(tool_use("search_docs", {"query": "어음 지급", "k": 1}, id="b")),
    reply(tool_use("write_file", {"path": ".env", "content": "x"}, id="c")),
    reply(tool_use("ontology_lookup", {"term": "삼자대사"}, id="d")),
    reply(text("어음 지급은 안 됩니다. 삼자대사(발주·입고·송장 대조)를 마친 송장만 계좌로 지급합니다.")),
])
LAB_OF = {"todo_write": "Lab 6", "search_docs": "Lab 9", "write_file": "Lab 7",
          "ontology_lookup": "Lab 10", "agent": "Lab 5"}


def on_event(kind, data):
    if kind == "tool":
        print(f"[{LAB_OF.get(data['name'], 'Lab 2')}] {data['name']}({json.dumps(data['input'], ensure_ascii=False)})")
    elif kind == "text":
        print(f"\n💬 {data}")


h = mh.MiniHarness(brain, approve=lambda c: False, memory_path="없음.md")
messages = [{"role": "user", "content": "어음으로 지급해도 돼?"}]
h.run_turn(messages, on_event=on_event)

results = [b for m in messages if isinstance(m["content"], list)
           for b in m["content"] if b.get("type") == "tool_result"]
print("\n도구 결과 첫 줄들:")
for r in results:
    print(" -", r["content"].splitlines()[0][:60])

# %% AGENTS.md 는 백과사전이 아니라 지도
#: OpenAI 의 'Harness engineering' 글은 에이전트용 안내 파일을 **약 100줄짜리 목차**로 유지하라고 권합니다. 1,000쪽 매뉴얼은 작업 맥락을 밀어내고 금방 낡기 때문입니다. 미니 하네스는 `AGENT.md` 를 시스템 프롬프트 끝에 붙입니다.
#? 바꿔 보기: 메모리 파일에 한 줄을 더 넣고 시스템 프롬프트 토큰 수 변화를 보세요.
import os
import tempfile
import mini_harness as mh
from common.brain import FakeBrain
from common.show import rough_tokens

os.chdir(tempfile.mkdtemp())
memo = "AGENT.md"
open(memo, "w", encoding="utf-8").write(
    "# 이 저장소 지도\n"
    "- 규정 문서: data/procurement/docs/ (search_docs 로 찾기)\n"
    "- 용어 정의: data/procurement/ontology.yaml (시스템 프롬프트에 이미 있음)\n"
    "- 테스트: python run_tests.py\n"
    "- 금지: .env 수정, 운영 DB 접속\n")
h = mh.MiniHarness(FakeBrain(), approve=lambda c: False, memory_path=memo)
print("시스템 프롬프트 ~", rough_tokens(h.system), "토큰 중 마지막 부분:\n")
print(h.system[h.system.index("<project-memory"):])
