#!/usr/bin/env python3
"""Lab 4 따라 해보기 예제.  실행: python labs/04_context_budget/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 로그 2만 줄을 통째로 넣으면?
#: `cat server.log` 결과가 2만 줄이면 그대로 배열에 들어가 컨텍스트를 다 먹어 버립니다. 그래서 결과는 **들어오는 순간** 자릅니다.
#: 앞뒤를 남기는 이유: 에러는 보통 **맨 끝**에 있고, 파일의 성격은 **맨 앞**에서 드러나기 때문입니다.
#? 바꿔 보기: `limit` 을 400 으로 늘리면 무엇이 더 보이나요?
import solution as lab

log = "\n".join(f"line {i}: OK" for i in range(1, 20_001)) + "\nline 20001: ERROR disk full"
cut = lab.truncate(log, limit=160)

print(f"원본 {len(log):,}자 (~{len(log)//4:,} 토큰) → 자른 뒤 {len(cut)}자")
print("── 모델이 보게 될 내용 ──")
print(cut)

# %% 캐시는 '앞부분이 같을 때'만 — 10라운드 비용 계산
#: **비유** — 책을 매번 처음부터 읽는 대신 *책갈피*를 꽂아 두면, 이미 읽은 부분은 훑기만 하면 됩니다. 단, 앞 페이지가 한 글자라도 바뀌면 책갈피는 무효입니다.
#: Anthropic 문서 기준으로 캐시 **쓰기는 1.25배, 읽기는 0.1배** 요금입니다. 시스템 프롬프트+도구 1만 토큰에 라운드마다 2천 토큰씩 늘어나는 에이전트를 계산해 봅시다.
#? 바꿔 보기: `ROUNDS` 를 30 으로 늘리면 절감률이 어떻게 되나요?
BASE, GROW, ROUNDS = 10_000, 2_000, 10
no_cache = with_cache = 0
for r in range(ROUNDS):
    total = BASE + GROW * r                     # 이번 요청의 입력 토큰
    no_cache += total                           # 캐시 없음: 매번 전부 정가
    if r == 0:
        with_cache += total * 1.25              # 첫 요청: 전부 캐시에 쓰기
    else:
        prev = BASE + GROW * (r - 1)
        with_cache += prev * 0.1 + (total - prev) * 1.25   # 앞부분 읽기 + 새 부분 쓰기
    print(f"라운드 {r+1:>2}: 입력 {total:>6,} 토큰")
print(f"\n캐시 없음 : {no_cache:>9,.0f} 토큰 요금")
print(f"캐시 사용 : {with_cache:>9,.0f} 토큰 요금  (약 {1 - with_cache/no_cache:.0%} 절약)")

# %% 책갈피(cache_control)는 맨 끝에
#: 하네스는 요청을 보낼 때마다 **마지막 블록**에 `cache_control` 을 붙입니다. 그러면 "여기까지는 다음에 다시 쓸 거예요"라는 표시가 됩니다. 원본 배열은 건드리지 않고 **사본**에만 붙이는 게 핵심입니다.
import solution as lab
from common.show import show

messages = [
    {"role": "user", "content": "규정 문서 요약해 줘"},
    {"role": "assistant", "content": [{"type": "text", "text": "목록부터 볼게요."},
                                      {"type": "tool_use", "id": "t1", "name": "run_command",
                                       "input": {"command": "ls docs"}}]},
    {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "01.md 02.md"}]},
]
sent = lab.with_cache_breakpoint({"messages": messages})
show(sent["messages"], "보낸 사본 (📌 = cache_control)")
show(messages, "원본 배열 (그대로)")

# %% 공간 vs 비용: 옛 도구 결과 지우기
#: 창이 꽉 차면 오래된 도구 결과를 `[생략]` 으로 바꿔 공간을 만들 수 있습니다. 하지만 **앞부분이 바뀌므로 캐시가 깨집니다.** 공짜 점심은 없습니다 — Lab 8 에서 이 깨짐을 탐지합니다.
import solution as lab
from common.show import show

def result(i, body):
    return {"role": "user", "content": [{"type": "tool_result", "tool_use_id": f"t{i}", "content": body}]}

messages = [{"role": "user", "content": "로그 분석해 줘"},
            result(1, "로그 A 3만 자…"), result(2, "로그 B 2만 자…"),
            result(3, "로그 C 1만 자…"), result(4, "방금 읽은 로그 D")]
show(lab.elide_old_tool_results(messages, keep_last=2), "keep_last=2 로 정리한 배열")
