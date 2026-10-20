# Lab 2 — 도구 = JSON 스키마 + 함수 디스패치

원문: [03-tools.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/03-tools.md)

## 무엇이 깨지나
두뇌는 텍스트만 쓸 수 있다. 파일을 읽거나 명령을 실행할 손이 없다.

## 패치
모델에게 도구 스키마(이름·설명·입력 형식)를 보여주면, 모델은 `tool_use` 블록을 '쓴다'. 실행은 하네스가 하고 결과를 `tool_result` 블록(같은 id)으로 돌려준다. 에러도 문자열로 돌려줘야 모델이 읽고 대처한다.

## 비용
도구 스키마도 매 요청마다 토큰을 먹는다. 설명이 곧 프롬프트다.

## 할 일 (`exercise.py`)
- `write_file` 스키마 추가
- `execute_tool` — 디스패치 + 에러를 문자열로
- `tool_results_for` — 모든 tool_use 에 id 맞춰 결과

```bash
python run_tests.py 2 -v
```

## 생각해볼 것
- `ask_with_tools` 는 도구를 딱 한 번만 허용합니다. '파일 목록을 보고 가장 큰 파일을 읽어줘' 같은 작업은 왜 실패할까요? → Lab 3
- 도구 description 을 일부러 모호하게 바꾸고 진짜 모델로 실행해 보세요.
