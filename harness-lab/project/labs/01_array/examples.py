#!/usr/bin/env python3
"""Lab 1 따라 해보기 예제.  실행: python labs/01_array/examples.py
'# %%' 로 나뉜 칸이 워크북 사이트의 예제 하나입니다. 칸마다 독립적으로 실행됩니다."""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 금붕어 기억력: 모델은 지난 말을 모른다
#: **비유** — 콜센터에 전화할 때마다 *처음 보는 상담원*이 받습니다. 지난 통화 내용을 알려주려면 통화 기록 전체를 매번 다시 읽어줘야 하죠. LLM API가 딱 그렇습니다.
#: 아래 두뇌는 "배열 안에서만" 이름을 찾습니다. 마지막 말만 보내면 모르고, 배열 전체를 보내면 압니다.
#? 바꿔 보기: `history` 의 첫 메시지를 지우고 실행하면 ② 도 모른다고 답합니다.
from common.brain import reply, text


def brain(request):
    """배열에 '내 이름은 ~' 이 있을 때만 이름을 아는 아주 단순한 두뇌"""
    for m in request["messages"]:
        if isinstance(m["content"], str) and m["content"].startswith("내 이름은 "):
            return reply(text(f"당신은 {m['content'][6:].rstrip('.')}님이죠!"))
    return reply(text("죄송해요, 이름을 들은 적이 없어요."))


history = [
    {"role": "user", "content": "내 이름은 지수."},
    {"role": "assistant", "content": [{"type": "text", "text": "반가워요!"}]},
    {"role": "user", "content": "내 이름이 뭐게?"},
]
print("① 마지막 말만 보내면 →", brain({"messages": history[-1:]})["content"][0]["text"])
print("② 배열 전체를 보내면 →", brain({"messages": history})["content"][0]["text"])

# %% 세 턴 동안 배열이 자라는 모습
#: `chat_once` 를 세 번 부르면 배열은 user/assistant 가 번갈아 6칸이 됩니다. 두뇌에게 보낸 메시지 수는 **1 → 3 → 5** 로 늘어납니다. 대화가 길어질수록 요청이 커지는 이유입니다.
#? 바꿔 보기: 리스트에 말을 하나 더 넣어 보세요. 보낸 메시지 수가 몇이 될까요?
import solution as lab
from common.brain import FakeBrain
from common.show import show

fake, sizes = FakeBrain(), []


def counting_brain(request):
    sizes.append(len(request["messages"]))     # 이번 요청에 실린 메시지 수 기록
    return fake(request)


messages = []
for said in ["안녕", "오늘 날씨 어때?", "고마워"]:
    lab.chat_once(counting_brain, messages, said)

print("매 호출에 보낸 메시지 수:", sizes)
show(messages, "3턴 뒤의 배열")

# %% 역사 고쳐 쓰기: 배열이 곧 진실
#: 세션 파일은 그냥 JSON 입니다. 파일 속 assistant 답을 몰래 바꾸면, 모델은 **자기가 그렇게 말했다고 믿습니다.** 모델이 아는 '과거'는 배열뿐이니까요.
#: (그래서 하네스는 배열을 함부로 고치면 안 되고, 디버깅할 땐 배열부터 봐야 합니다.)
#? 바꿔 보기: 바꿔치기할 문장을 다른 말로 고쳐 실행해 보세요.
import os
import tempfile
import solution as lab
from common.brain import reply, text


def parrot(request):
    """자기가 '마지막으로 한 말'을 배열에서 찾아 인용하는 두뇌"""
    said = [b["text"] for m in request["messages"] if m["role"] == "assistant"
            for b in m["content"]]
    return reply(text(f"제가 아까 '{said[-1]}' 라고 했잖아요." if said else "처음 뵙겠습니다."))


path = os.path.join(tempfile.mkdtemp(), "session.json")
messages = []
print("턴 1:", lab.chat_once(parrot, messages, "안녕"))
lab.save_session(path, messages)

data = lab.load_session(path)                     # 파일을 열어
data[1]["content"][0]["text"] = "저는 사실 고양이예요"  # assistant 답을 바꿔치기
lab.save_session(path, data)

messages = lab.load_session(path)                 # 다시 불러와 대화를 이어가면
print("턴 2:", lab.chat_once(parrot, messages, "아까 뭐라고 했죠?"))
