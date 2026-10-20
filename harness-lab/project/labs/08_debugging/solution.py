#!/usr/bin/env python3
"""Lab 8 — 배열 디버깅: 보이지 않는 프롬프트는 고칠 수 없다.

에이전트가 이상하게 굴면 원인은 거의 항상 '실제로 보낸 배열' 안에 있습니다.
1. 캡처   : 매 요청/응답을 JSONL 로 그대로 기록 (HARNESS_DEBUG=1)
2. 캐시 활력징후: usage 에서 캐시 적중률을 계산 → 갑자기 0 이 되면 prefix 가 깨진 것
3. prefix 비교: 이전 요청과 이번 요청이 '어디서부터' 달라졌는지 찾기

실행:  python labs/08_debugging/solution.py debug.jsonl   (캡처 파일 요약)
"""
import json
import os
import sys
import time


class CapturingBrain:
    """두뇌를 감싸서 모든 왕복을 path(JSONL)에 한 줄씩 기록한다."""

    def __init__(self, brain, path="harness_debug.jsonl"):
        self.brain, self.path, self.n = brain, path, 0

    def __call__(self, request):
        # >>> TODO: 원래 두뇌를 호출하고, {"n", "t", "request", "response"} 한 줄을 path 에 append 하세요
        response = self.brain(request)
        self.n += 1
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"n": self.n, "t": time.time(),
                                "request": request, "response": response},
                               ensure_ascii=False) + "\n")
        return response
        # <<< TODO


def cache_hit_ratio(usage):
    """캐시에서 읽은 입력 토큰 비율 = cache_read / (input + cache_read + cache_creation).
    분모가 0 이면 0.0."""
    # >>> TODO: usage dict 의 키가 없으면 0 으로 취급하세요
    read = usage.get("cache_read_input_tokens", 0) or 0
    total = (usage.get("input_tokens", 0) or 0) + read + (usage.get("cache_creation_input_tokens", 0) or 0)
    return read / total if total else 0.0
    # <<< TODO


def first_divergence(prev_messages, curr_messages):
    """이전 요청의 배열이 이번 요청 배열의 '앞부분'으로 그대로 남아 있으면 None.
    아니면 처음으로 달라진 메시지 인덱스를 반환한다. (None = 캐시 친화적)
    주의: cache_control 표시는 비교에서 무시한다."""
    # >>> TODO: cache_control 을 지운 사본끼리 앞에서부터 비교하세요
    def clean(m):
        m = json.loads(json.dumps(m))
        if isinstance(m.get("content"), list):
            for b in m["content"]:
                b.pop("cache_control", None)
        return m
    for i, pm in enumerate(prev_messages):
        if i >= len(curr_messages) or clean(pm) != clean(curr_messages[i]):
            return i
    return None
    # <<< TODO


def summarize(path):
    """캡처 파일을 읽어 요청마다 메시지 수, 추정 크기, 캐시율, prefix 깨짐 여부를 출력."""
    prev = None
    for line in open(path, encoding="utf-8"):
        rec = json.loads(line)
        msgs = rec["request"]["messages"]
        div = first_divergence(prev, msgs) if prev is not None else None
        ratio = cache_hit_ratio(rec["response"].get("usage", {}))
        flag = f"  ⚠️ prefix 깨짐 @ {div}" if div is not None else ""
        print(f"#{rec['n']:>3}  msgs={len(msgs):>3}  ~{len(json.dumps(msgs)) // 4:>6} tok"
              f"  cache={ratio:5.0%}{flag}")
        prev = msgs


if __name__ == "__main__":
    if len(sys.argv) < 2 or not os.path.exists(sys.argv[1]):
        print("사용법: python labs/08_debugging/solution.py <capture.jsonl>")
    else:
        summarize(sys.argv[1])
