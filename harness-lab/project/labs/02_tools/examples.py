#!/usr/bin/env python3
"""Lab 2 따라 해보기 예제.  실행: python labs/02_tools/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 날씨 도구 하나로 보는 도구 호출의 3단계
#: Hugging Face 에이전트 코스의 날씨 비서 예제를 하네스 쪽에서 본 모습입니다.
#: **비유** — 모델은 *전화로만 일하는 비서*입니다. 직접 창밖을 볼 수 없으니 "부산 날씨 좀 확인해 주세요"라는 **메모(tool_use)** 를 건넵니다. 하네스가 실제로 확인하고, 같은 메모 번호(id)를 붙여 **답장(tool_result)** 을 돌려줍니다.
#? 바꿔 보기: 도시를 "제주"로 바꾸면 어떤 결과가 돌아가나요? 에러도 문자열로 돌아가는 걸 확인하세요.
from common.brain import reply, text, tool_use
from common.show import show

WEATHER = {"서울": "맑음 18°C", "부산": "흐림 21°C"}       # 가짜 날씨 서버
weather_tool = {                                          # ① 모델에게 보여줄 스키마
    "name": "get_weather",
    "description": "도시의 현재 날씨를 알려준다.",
    "input_schema": {"type": "object",
                     "properties": {"city": {"type": "string"}},
                     "required": ["city"]},
}


def get_weather(city):                                    # ② 하네스가 실행할 함수
    return WEATHER.get(city, f"ERROR: '{city}' 날씨 정보가 없습니다")


# 모델이 '쓴' 응답 — 직접 실행하지 못하고 부탁만 한다
response = reply(text("날씨를 확인해 볼게요."),
                 tool_use("get_weather", {"city": "부산"}, id="toolu_01"))
call = response["content"][1]
print("1) 모델의 부탁  :", call["name"], call["input"])

result = get_weather(**call["input"])                     # 하네스가 실제로 실행
print("2) 하네스 실행  :", result)

messages = [                                              # 같은 id 로 결과를 돌려준다
    {"role": "user", "content": "부산 날씨 어때?"},
    {"role": "assistant", "content": response["content"]},
    {"role": "user", "content": [{"type": "tool_result",
                                  "tool_use_id": call["id"], "content": result}]},
]
print("3) 다음 요청에 실릴 배열:")
show(messages)

# %% 에러도 '관찰'이다
#: 도구가 실패해도 하네스는 죽으면 안 됩니다. 실패 내용을 문자열로 돌려주면 모델이 읽고 "경로를 고쳐서 다시 읽어볼게요" 하고 스스로 복구합니다.
#? 바꿔 보기: `read_file` 경로를 `README.md` 로 바꿔 성공 결과를 보세요.
import solution as lab

calls = [
    ("run_command", {"command": "echo 안녕 하네스"}),
    ("read_file", {"path": "없는파일.txt"}),
    ("read_file", {"wrong": "인자 이름이 틀림"}),
    ("fly_to_moon", {}),
]
for name, args in calls:
    print(f"{name:12} → {lab.execute_tool(name, args).strip()}")

# %% 왜 도구 한 번으론 부족할까?
#: Lab 2 의 `ask_with_tools` 는 도구를 **딱 한 번만** 실행합니다. 그런데 모델은 "목록을 보고 → 파일을 읽고 → 답하기"처럼 여러 번 필요할 때가 많습니다. 두 번째 부탁은 실행되지 못하고 버려집니다. 이걸 고치는 게 Lab 3 의 에이전트 루프입니다.
import solution as lab
from common.brain import ScriptedBrain, reply, text, tool_use

brain = ScriptedBrain([
    reply(text("먼저 목록을 볼게요."),
          tool_use("run_command", {"command": "ls data/procurement/docs"}, id="toolu_a")),
    reply(text("이제 대금지급 규정을 읽어야겠어요."),
          tool_use("read_file", {"path": "data/procurement/docs/06_대금지급_규정.md"}, id="toolu_b")),
])
messages = []
answer = lab.ask_with_tools(brain, messages, "어음으로 지급해도 돼?")
print("사용자가 받은 답:", answer)
print("마지막 응답의 stop_reason:", "tool_use", "← 아직 도구를 원하는데 대화가 끝나버림")
print("⚠️ toolu_b (파일 읽기)는 실행되지 않았습니다.")
