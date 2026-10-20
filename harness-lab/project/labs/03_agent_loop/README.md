# Lab 3 — 에이전트 루프

원문: [04-the-agent-loop.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/04-the-agent-loop.md)

## 무엇이 깨지나
실제 작업은 도구를 여러 번, 이전 결과를 보고 이어서 써야 한다.

## 패치
`stop_reason == "tool_use"` 인 동안 [호출 → 실행 → 결과 덧붙이기]를 반복. 이게 '에이전트'의 전부다. 병렬 tool_use 결과는 하나의 user 메시지에 모은다. `MAX_ROUNDS` 로 폭주를 막는다.

## 비용
라운드마다 배열 전체를 다시 보낸다 → 비용이 라운드 수의 제곱처럼 커진다 (→ Lab 4).

## 할 일 (`exercise.py`)
- `run_turn` 루프 하나

```bash
python run_tests.py 3 -v
```

## 생각해볼 것
- 진짜 모델로 '이 폴더에 hello.py 를 만들고 실행해서 결과를 알려줘'를 시켜보세요.
- `MAX_ROUNDS=2` 로 바꾸면 어떻게 끝나나요? 모델에게 그 사실을 알려줘야 할까요?
