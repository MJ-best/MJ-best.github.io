#!/usr/bin/env python3
"""[연습] Lab 4 — 컨텍스트는 '예산'이다 + 캐싱은 '순서'에 달려 있다.

배열을 매번 통째로 보내니 (1) 비용이 쌓이고 (2) 창(window)이 가득 찹니다.
- 캐싱: 앞부분(prefix)이 이전 요청과 '바이트 단위로 같으면' 싸게 재사용됩니다.
        그래서 배열은 append-only 로 다뤄야 하고, 캐시 표시는 맨 끝에 둡니다.
- 예산: 큰 도구 결과는 '들어오는 시점에' 잘라야 합니다. 나중에 옛 결과를 지우면
        공간은 생기지만 prefix 가 바뀌어 캐시가 깨집니다 (비용 ↔ 공간 트레이드오프).
"""
import copy
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

MAX_RESULT_CHARS = 2_000
ELIDED = "[이전 도구 결과 생략됨]"


def truncate(text, limit=MAX_RESULT_CHARS):
    """limit 보다 길면 앞 절반 + 표시 + 뒤 절반만 남긴다.
    표시 형식: "\\n...[N chars truncated]...\\n"  (N = 잘라낸 글자 수)
    짧으면 그대로 반환."""
    # TODO(1): 앞/뒤를 limit//2 씩 남기고 가운데를 표시로 바꾸세요
    raise NotImplementedError("04_context_budget TODO(1)")


def estimate_tokens(obj):
    """아주 거친 추정: JSON 글자 수 / 4. (정확한 값은 API 응답의 usage 로 확인)"""
    return len(json.dumps(obj, ensure_ascii=False)) // 4


def with_cache_breakpoint(request):
    """요청의 '사본'을 만들어 마지막 메시지의 마지막 블록에
    "cache_control": {"type": "ephemeral"} 를 붙여 반환한다.
    - 마지막 메시지 content 가 문자열이면 [{"type":"text","text":...}] 로 바꿔서 붙인다.
    - 원본 request/messages 는 절대 바꾸지 않는다 (append-only 배열 보호)."""
    # TODO(2): deepcopy 후 마지막 블록에 cache_control 을 붙여 반환하세요
    raise NotImplementedError("04_context_budget TODO(2)")


def elide_old_tool_results(messages, keep_last=2):
    """마지막 keep_last 개를 제외한 옛 tool_result 의 content 를 ELIDED 로 바꾼 '새 배열'을 반환.
    (원본은 그대로. 이 함수를 쓰면 공간은 생기지만 캐시 prefix 가 깨진다는 걸 Lab 8에서 확인합니다)"""
    # TODO(3): 모든 tool_result 블록 위치를 모은 뒤, 뒤에서 keep_last 개를 빼고 내용을 바꾸세요
    raise NotImplementedError("04_context_budget TODO(3)")


def load_memory(path="AGENT.md"):
    """프로젝트 메모리 파일이 있으면 시스템 프롬프트에 붙일 문자열로, 없으면 ""."""
    if not os.path.exists(path):
        return ""
    with open(path, encoding="utf-8") as f:
        return f"\n\n<project-memory path={path!r}>\n{f.read()}\n</project-memory>"


if __name__ == "__main__":
    big = "x" * 10_000
    print("원본", len(big), "→ 자른 뒤", len(truncate(big)))
    req = {"system": "s", "messages": [{"role": "user", "content": "hi"}]}
    print(json.dumps(with_cache_breakpoint(req), ensure_ascii=False, indent=1))
