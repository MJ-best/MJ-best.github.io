"""배열(messages)을 눈으로 보기 위한 출력 도우미 — 예제용.

    show(messages)        →  [0] user      "안녕"
                             [1] assistant text "반가워요"
                                           tool_use[t1] read_file({"path": "a.txt"})
                             [2] user      tool_result[t1] "파일 내용…"
"""
import json


def short(s, n=56):
    s = str(s).replace("\n", "⏎")
    return s if len(s) <= n else s[:n - 1] + "…"


def block_str(b):
    t = b.get("type")
    if t == "text":
        return f'text "{short(b["text"])}"'
    if t == "tool_use":
        return f'tool_use[{b["id"]}] {b["name"]}({short(json.dumps(b["input"], ensure_ascii=False), 44)})'
    if t == "tool_result":
        c = b["content"]
        if isinstance(c, list):
            c = "".join(x.get("text", "") for x in c)
        return f'tool_result[{b["tool_use_id"]}] "{short(c, 40)}"'
    return str(t)


def show(messages, title=None):
    """배열을 한 줄에 블록 하나씩 출력한다. 📌 = cache_control 표시."""
    if title:
        print(f"── {title} ──")
    for i, m in enumerate(messages):
        head = f"[{i}] {m['role']:<9}"
        c = m["content"]
        if isinstance(c, str):
            print(f'{head} "{short(c)}"')
            continue
        for k, b in enumerate(c):
            pin = " 📌" if "cache_control" in b else ""
            print(f"{head if k == 0 else ' ' * len(head)} {block_str(b)}{pin}")
    print()


def rough_tokens(obj):
    """아주 거친 토큰 추정: JSON 글자 수 / 4 (한글이 많으면 실제로는 더 많다)."""
    s = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    return len(s) // 4
