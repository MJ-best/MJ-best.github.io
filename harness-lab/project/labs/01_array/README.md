# Lab 1 — 대화는 그냥 JSON 배열이다

원문: [01-its-just-a-json-array.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/01-its-just-a-json-array.md)

## 무엇이 깨지나
API는 지난 대화를 기억하지 않는다. 그럼 '대화'는 어디에 있나?

## 패치
대화 = 하네스가 들고 있는 `messages` 배열. 매 턴 배열 **전체**를 다시 보내고, 응답의 content 블록을 통째로 붙인다. 세션 = 이 배열을 저장한 JSON 파일.

## 비용
대화가 길어질수록 매 요청이 커진다 (→ Lab 4).

## 할 일 (`exercise.py`)
- `add_user`, `add_assistant`, `text_of`
- `chat_once` — 한 턴 완성
- `save_session` / `load_session`

```bash
python run_tests.py 1 -v
```

## 생각해볼 것
- `python labs/01_array/exercise.py s.json` 로 대화한 뒤 `s.json` 을 열어보고, 손으로 assistant 답을 바꾼 다음 다시 실행해 보세요. 모델은 '자기가 그렇게 말했다'고 믿습니다.
- `/clear` 는 왜 한 줄로 끝날까요?
