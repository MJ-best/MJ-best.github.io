# Lab 5 — 서브에이전트 = 컨텍스트 포크

원문: [07-subagents.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/07-subagents.md)

## 무엇이 깨지나
조사 과정(파일 수십 개 읽기)이 부모 배열을 다 채워버린다.

## 패치
`agent` 도구가 호출되면 **새 배열**로 같은 루프를 돌리고, 부모에게는 최종 보고서 텍스트만 돌려준다. 서브에이전트에게는 `agent` 도구를 주지 않는다.

## 비용
서브에이전트는 부모의 맥락을 모른다 → 위임 메시지(task)를 자기완결적으로 써야 한다. 호출 비용도 따로 든다.

## 할 일 (`exercise.py`)
- `run_subagent`
- `make_executor`

```bash
python run_tests.py 5 -v
```

## 생각해볼 것
- FakeBrain 에서 `ask read README.md` 를 입력하고 `/dump` 로 부모 배열에 무엇이 남는지 보세요.
- 부록 B(worktree)는 서브에이전트에게 '세상의 사본'까지 따로 주는 이야기입니다.
