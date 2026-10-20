#!/usr/bin/env python3
"""[연습] Lab 6 — 돌고 있는 루프 조종하기: 리마인더 큐 + 할 일 목록.

긴 작업 중 두뇌는 목표를 잊고 표류합니다. 하네스는 다음 user 쪽 메시지(=tool_result
메시지)에 <system-reminder> 블록을 슬쩍 끼워 넣어 방향을 잡아줍니다.
- 사용자가 실행 중에 던진 말 (steer)
- 하네스가 감지한 사실 (예: "파일이 바깥에서 바뀌었음")
- 매 라운드 다시 보여주는 할 일 목록 (todo)

주의: 끼워 넣는 위치는 '배열 끝'입니다. 시스템 프롬프트를 고치면 캐시가 깨지니까요.
"""
import os
import sys
import threading

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

TODO_TOOL = {
    "name": "todo_write",
    "description": "할 일 목록 전체를 교체한다. 한 줄에 하나, 끝난 항목은 'x ' 로 시작.",
    "input_schema": {"type": "object",
                     "properties": {"items": {"type": "string"}},
                     "required": ["items"]},
}


def reminder_block(text):
    return {"type": "text", "text": f"<system-reminder>\n{text}\n</system-reminder>"}


class Steering:
    def __init__(self):
        self._lock = threading.Lock()   # 다른 스레드(입력, 백그라운드 작업)도 remind 할 수 있음
        self._queue = []
        self.todos = []                 # [(done: bool, text: str)]

    def remind(self, text):
        with self._lock:
            self._queue.append(text)

    def steer(self, user_text):
        """사용자가 루프 실행 중에 끼어든 말."""
        self.remind(f"사용자가 작업 도중 이렇게 말했습니다: {user_text}")

    def todo_write(self, items):
        """'x 끝난일\\n할일' 형식 문자열을 파싱해 self.todos 를 교체하고 확인 메시지를 반환."""
        # TODO(1): 줄마다 'x ' 접두사로 완료 여부를 판단해 (bool, text) 리스트로 만드세요 (빈 줄 무시)
        raise NotImplementedError("06_steering TODO(1)")

    def render_todos(self):
        return "\n".join(f"[{'x' if d else ' '}] {t}" for d, t in self.todos)

    def inject(self, blocks):
        """run_loop 의 inject 훅. tool_result 블록 리스트 '뒤에' 리마인더를 붙인다.
        1) 큐에 쌓인 리마인더들을 한 블록으로 합쳐 붙이고 큐를 비운다
        2) 할 일 목록이 있고 미완료 항목이 있으면 "현재 할 일:\\n<render_todos>" 블록도 붙인다
        리마인더가 하나도 없으면 아무것도 붙이지 않는다."""
        # TODO(2): 잠금 안에서 큐를 비우고, 위 규칙대로 reminder_block 을 blocks 에 append 하세요
        raise NotImplementedError("06_steering TODO(2)")

    def executor(self, base_execute):
        """todo_write 는 여기서 처리하고 나머지는 base_execute 로."""
        def execute(name, args):
            if name == "todo_write":
                return self.todo_write(args["items"])
            return base_execute(name, args)
        return execute


if __name__ == "__main__":
    s = Steering()
    s.todo_write("x 저장소 둘러보기\n테스트 고치기")
    s.steer("README도 같이 고쳐줘")
    blocks = [{"type": "tool_result", "tool_use_id": "t1", "content": "ok"}]
    s.inject(blocks)
    for b in blocks:
        print(b.get("text") or b)
