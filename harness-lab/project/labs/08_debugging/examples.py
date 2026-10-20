#!/usr/bin/env python3
"""Lab 8 따라 해보기 예제.  실행: python labs/08_debugging/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 블랙박스 녹화: 실제로 보낸 것을 남겨라
#: **비유** — 사고가 나면 블랙박스부터 봅니다. 에이전트가 이상하게 굴 때도 "모델이 실제로 받은 배열"을 보면 원인이 대부분 보입니다.
#: 세 번째 턴 직전에 누군가 첫 메시지를 고쳤습니다(예: 시스템이 날짜를 끼워 넣음). 요약표가 **prefix 깨짐**을 바로 잡아냅니다.
#? 바꿔 보기: 첫 메시지를 고치는 줄을 지우면 경고가 사라집니다.
import os
import tempfile
import solution as lab
from common.brain import FakeBrain

path = os.path.join(tempfile.mkdtemp(), "capture.jsonl")
brain = lab.CapturingBrain(FakeBrain(), path)

messages = []
for said in ["안녕", "규정 알려줘"]:
    messages.append({"role": "user", "content": said})
    messages.append({"role": "assistant", "content": brain({"messages": messages})["content"]})

messages[0]["content"] = "[2026-10-20] 안녕"          # 😱 앞부분을 몰래 수정
messages.append({"role": "user", "content": "고마워"})
brain({"messages": messages})

lab.summarize(path)

# %% 캐시 활력징후 읽기
#: API 응답의 `usage` 에는 캐시에서 읽은 토큰 수가 들어 있습니다. 평소 90% 근처이던 적중률이 갑자기 0% 가 되면 → 누군가 앞부분을 바꾼 겁니다.
import solution as lab

timeline = [
    ("1턴 (첫 요청)", {"input_tokens": 50, "cache_creation_input_tokens": 9_000}),
    ("2턴",          {"input_tokens": 40, "cache_read_input_tokens": 9_000, "cache_creation_input_tokens": 600}),
    ("3턴",          {"input_tokens": 40, "cache_read_input_tokens": 9_600, "cache_creation_input_tokens": 500}),
    ("4턴 ⚠️",       {"input_tokens": 40, "cache_creation_input_tokens": 10_600}),
]
for label, usage in timeline:
    r = lab.cache_hit_ratio(usage)
    print(f"{label:<14} 적중률 {r:5.0%}  {'█' * round(r * 20)}")

# %% 범인 찾기: 어디서부터 달라졌나
#: `first_divergence` 는 이전 요청과 이번 요청을 앞에서부터 비교해 **처음 달라진 위치**를 알려줍니다. `None` 이면 끝에 덧붙이기만 한 것(캐시 친화적)입니다.
import solution as lab

base = [{"role": "user", "content": "시작"},
        {"role": "assistant", "content": [{"type": "text", "text": "네"}]}]
cases = {
    "끝에 덧붙이기만": base + [{"role": "user", "content": "다음"}],
    "옛 결과 요약으로 교체": [base[0], {"role": "assistant", "content": [{"type": "text", "text": "[요약]"}]}],
    "첫 메시지에 날짜 삽입": [{"role": "user", "content": "[오늘] 시작"}] + base[1:],
}
for name, curr in cases.items():
    print(f"{name:<14} → 처음 달라진 위치: {lab.first_divergence(base, curr)}")
