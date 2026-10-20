# Lab 6 — 돌고 있는 루프 조종하기

원문: [08-steering.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/08-steering.md)

## 무엇이 깨지나
긴 작업 중 두뇌가 목표를 잊거나, 사용자가 도중에 방향을 바꾸고 싶다.

## 패치
리마인더를 큐에 쌓아 두었다가 다음 `tool_result` 메시지 **끝에** `<system-reminder>` 블록으로 붙인다. todo 목록은 미완료 항목이 있는 동안 매 라운드 다시 보여준다.

## 비용
리마인더도 토큰이다. 시스템 프롬프트가 아니라 배열 끝에 붙이는 이유는 캐시 때문.

## 할 일 (`exercise.py`)
- `todo_write` 파싱
- `inject` — 큐 비우기 + todo 재표시

```bash
python run_tests.py 6 -v
```

## 생각해볼 것
- 캡스톤에서 `/steer 테스트도 같이 돌려줘` 를 써 보세요.
- 백그라운드 작업 완료 알림(9장)도 같은 큐로 만들 수 있습니다.
