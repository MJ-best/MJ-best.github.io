"""두뇌(LLM) 백엔드 모음.

하네스는 두뇌를 "요청 dict → 응답 dict" 함수로만 봅니다.
    response = brain({"system": ..., "messages": [...], "tools": [...]})
응답 형식은 Anthropic Messages API와 같습니다:
    {"content": [블록...], "stop_reason": "end_turn" | "tool_use" | ..., "usage": {...}}

- AnthropicBrain : 진짜 API 호출 (표준 라이브러리만 사용)
- ScriptedBrain  : 미리 정해둔 응답을 순서대로 돌려줌 (테스트용, 받은 요청을 기록)
- FakeBrain      : 규칙 기반 가짜 두뇌 (API 키 없이 대화형으로 체험)
"""
import copy
import itertools
import json
import os
import urllib.request

DEFAULT_MODEL = os.environ.get("HARNESS_MODEL", "claude-sonnet-5-5")
_ids = itertools.count(1)


# ----------------------------------------------------------- 응답 만들기 도우미
def text(t):
    return {"type": "text", "text": t}


def tool_use(name, input=None, id=None):
    return {"type": "tool_use", "id": id or f"toolu_{next(_ids):04d}",
            "name": name, "input": input or {}}


def reply(*blocks, stop_reason=None, usage=None):
    """블록들로 API 응답 dict를 만든다. tool_use가 있으면 stop_reason=tool_use."""
    if stop_reason is None:
        stop_reason = ("tool_use" if any(b["type"] == "tool_use" for b in blocks)
                       else "end_turn")
    return {"content": list(blocks), "stop_reason": stop_reason,
            "usage": usage or {"input_tokens": 0, "output_tokens": 0}}


# ------------------------------------------------------------------ 진짜 두뇌
class AnthropicBrain:
    URL = "https://api.anthropic.com/v1/messages"

    def __init__(self, model=None, api_key=None, max_tokens=4096):
        self.model = model or DEFAULT_MODEL
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.max_tokens = max_tokens
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 환경변수가 필요합니다.")

    def __call__(self, request):
        body = {"model": self.model, "max_tokens": self.max_tokens}
        body.update({k: v for k, v in request.items() if v not in (None, [])})
        req = urllib.request.Request(
            self.URL, data=json.dumps(body).encode(),
            headers={"content-type": "application/json",
                     "x-api-key": self.api_key,
                     "anthropic-version": "2023-06-01"})
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())


# ------------------------------------------------------------ 테스트용 두뇌
class ScriptedBrain:
    """정해진 응답을 순서대로 반환. self.requests에 받은 요청의 '스냅샷'을 쌓는다."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request):
        # 하네스가 나중에 배열을 바꿔도 "보낸 순간의 모습"이 남도록 깊은 복사
        self.requests.append(copy.deepcopy(request))
        if not self.responses:
            raise AssertionError("ScriptedBrain: 준비된 응답보다 호출이 많습니다 "
                                 "(루프가 멈추지 않았나요?)")
        r = self.responses.pop(0)
        return r(request) if callable(r) else copy.deepcopy(r)


# ------------------------------------------------------- 오프라인 체험용 두뇌
class FakeBrain:
    """API 키 없이 하네스를 만져보기 위한 규칙 기반 두뇌.

    마지막 user 메시지가
      - 텍스트 "read <경로>"      → read_file 도구 호출
      - 텍스트 "run <명령>"       → run_command 도구 호출
      - 텍스트 "write <경로> <내용>" → write_file 도구 호출
      - 텍스트 "ask <작업>"       → agent(서브에이전트) 도구 호출 (도구가 있을 때만)
      - tool_result 블록들        → 결과 앞부분을 요약해서 end_turn
      - 그 밖의 텍스트            → 메시지 개수와 함께 메아리
    """

    def __call__(self, request):
        msgs = request.get("messages", [])
        tool_names = {t["name"] for t in request.get("tools") or []}
        last = msgs[-1]["content"] if msgs else ""
        if isinstance(last, list):
            results = [b for b in last if b.get("type") == "tool_result"]
            if results:
                lines = []
                for b in results:
                    c = b["content"]
                    if isinstance(c, list):
                        c = "".join(x.get("text", "") for x in c)
                    lines.append(c.strip().splitlines()[0][:200] if c.strip() else "(빈 결과)")
                return reply(text("[fake] 도구 결과 첫 줄: " + " | ".join(lines)))
            last = "".join(b.get("text", "") for b in last if b.get("type") == "text")
        # 하네스가 붙인 <system-reminder> 는 명령 해석에서 제외
        cmd = last.split("<system-reminder>")[0].strip()
        verb, _, rest = cmd.partition(" ")
        if verb == "read" and "read_file" in tool_names:
            return reply(tool_use("read_file", {"path": rest}))
        if verb == "run" and "run_command" in tool_names:
            return reply(tool_use("run_command", {"command": rest}))
        if verb == "write" and "write_file" in tool_names:
            path, _, content = rest.partition(" ")
            return reply(tool_use("write_file", {"path": path, "content": content}))
        if verb == "ask" and "agent" in tool_names:
            return reply(tool_use("agent", {"task": rest}))
        return reply(text(f"[fake] 메시지 {len(msgs)}개를 받았어요. 마지막: {cmd!r}"))


def get_brain():
    """HARNESS_BRAIN=fake 이거나 API 키가 없으면 FakeBrain, 아니면 진짜 API."""
    if os.environ.get("HARNESS_BRAIN") == "fake" or not os.environ.get("ANTHROPIC_API_KEY"):
        print("[harness] FakeBrain 사용 중 (진짜 모델: ANTHROPIC_API_KEY 설정)")
        return FakeBrain()
    return AnthropicBrain()
