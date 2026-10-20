"""에이전트 루프 — Lab 3의 참고 구현. Lab 4 이후 랩들이 가져다 씁니다.

    호출 → (tool_use면) 실행 → 결과 덧붙이기 → 다시 호출 … stop_reason != tool_use 까지
"""
from common.toolbox import execute_tool as _default_execute

MAX_ROUNDS = 50


def final_text(response):
    return "".join(b["text"] for b in response["content"] if b["type"] == "text")


def run_loop(brain, messages, tools, system, execute=_default_execute,
             max_rounds=MAX_ROUNDS, inject=None, on_event=None):
    """messages를 제자리에서 늘려가며 루프를 돈다. 마지막 응답의 텍스트를 반환.

    execute(name, args) -> str  : 도구 실행기 (가드레일 등으로 감쌀 수 있음)
    inject(blocks)              : tool_result 블록 리스트에 블록을 더 붙일 기회 (Lab 6)
    on_event(kind, data)        : 화면 출력용 콜백 ("text" | "tool" | "limit")
    """
    emit = on_event or (lambda kind, data: None)
    for _ in range(max_rounds):
        response = brain({"system": system, "messages": messages, "tools": tools})
        messages.append({"role": "assistant", "content": response["content"]})
        for b in response["content"]:
            if b["type"] == "text" and b["text"].strip():
                emit("text", b["text"])
        if response.get("stop_reason") != "tool_use":
            return final_text(response)

        results = []
        for b in response["content"]:
            if b["type"] == "tool_use":
                emit("tool", b)
                results.append({"type": "tool_result", "tool_use_id": b["id"],
                                "content": execute(b["name"], b["input"])})
        if inject:
            inject(results)
        messages.append({"role": "user", "content": results})
    emit("limit", max_rounds)
    return f"[harness] MAX_ROUNDS({max_rounds}) 도달, 이번 턴을 중단합니다."


def printer(kind, data):
    """기본 출력 콜백."""
    if kind == "text":
        print(f"\nassistant> {data}")
    elif kind == "tool":
        import json
        print(f"  [tool] {data['name']}({json.dumps(data['input'], ensure_ascii=False)[:120]})")
    elif kind == "limit":
        print(f"  [harness] MAX_ROUNDS={data} 도달")
