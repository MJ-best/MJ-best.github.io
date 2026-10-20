#!/usr/bin/env python3
"""[연습] Lab 1 — 대화는 그냥 JSON 배열이다.

LLM API는 상태가 없습니다. 매 턴마다 '대화 전체'를 배열로 다시 보내고,
돌아온 응답을 배열 끝에 붙입니다. 세션 = 이 배열을 파일에 저장한 것.

실행:  python labs/01_array/solution.py [session.json]
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.brain import get_brain  # noqa: E402

SYSTEM = "너는 간결하게 답하는 조수다."


def add_user(messages, text):
    """사용자 발화를 배열 끝에 붙이고 배열을 반환한다."""
    # TODO(1): {"role": "user", "content": text} 를 messages 끝에 추가하세요
    raise NotImplementedError("01_array TODO(1)")
    return messages


def add_assistant(messages, response):
    """API 응답의 content '블록 리스트 전체'를 assistant 메시지로 붙인다.
    (텍스트만 뽑아 넣으면 나중에 tool_use 블록이 사라져 대화가 깨집니다)"""
    # TODO(2): response["content"] 를 그대로 담은 assistant 메시지를 추가하세요
    raise NotImplementedError("01_array TODO(2)")
    return messages


def text_of(response):
    """응답에서 text 블록들의 글자만 이어 붙인다."""
    # TODO(3): type == "text" 인 블록의 "text" 를 모두 이어 붙여 반환하세요
    raise NotImplementedError("01_array TODO(3)")


def build_request(messages, system=SYSTEM):
    """두뇌에게 보낼 요청 dict. 모델은 이것 '만' 봅니다."""
    return {"system": system, "messages": messages}


def chat_once(brain, messages, user_text):
    """한 턴: 사용자 발화 추가 → 배열 전체 전송 → 응답 추가 → 텍스트 반환."""
    # TODO(4): 위의 세 함수와 build_request 를 이용해 한 턴을 완성하세요
    raise NotImplementedError("01_array TODO(4)")


def save_session(path, messages):
    """세션 = 배열을 JSON 파일로 저장한 것."""
    # TODO(5): messages 를 path 에 JSON으로 저장하세요 (ensure_ascii=False, indent=2 권장)
    raise NotImplementedError("01_array TODO(5)")


def load_session(path):
    """파일이 없으면 빈 배열(새 대화)."""
    # TODO(6): 파일이 있으면 JSON을 읽어 반환, 없으면 [] 를 반환하세요
    raise NotImplementedError("01_array TODO(6)")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    brain = get_brain()
    messages = load_session(path) if path else []
    print("명령: /quit 종료, /clear 새 대화, /dump 배열 보기")
    while True:
        try:
            user_text = input("\nyou> ").strip()
        except EOFError:
            break
        if user_text in ("/quit", ""):
            break
        if user_text == "/clear":
            messages = []
            continue
        if user_text == "/dump":
            print(json.dumps(messages, ensure_ascii=False, indent=2))
            continue
        print(f"\nassistant> {chat_once(brain, messages, user_text)}")
        if path:
            save_session(path, messages)


if __name__ == "__main__":
    main()
