# Lab 4 — 컨텍스트는 예산, 캐싱은 순서

원문: [06-context-is-a-budget.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/06-context-is-a-budget.md)

## 무엇이 깨지나
배열이 비싸지고(매번 전체 전송), 결국 컨텍스트 창이 가득 찬다.

## 패치
(1) 큰 도구 결과는 들어오는 순간 자른다. (2) 배열을 append-only 로 다루고 마지막 블록에 `cache_control` 을 붙여 prefix 를 캐시한다. (3) 프로젝트 메모리(AGENT.md)는 시스템 프롬프트에 고정으로.

## 비용
옛 결과를 지우면(`elide_old_tool_results`) 공간은 생기지만 prefix 가 바뀌어 캐시가 깨진다 — Lab 8 에서 눈으로 확인.

## 할 일 (`exercise.py`)
- `truncate`
- `with_cache_breakpoint` — 원본 불변!
- `elide_old_tool_results`

```bash
python run_tests.py 4 -v
```

## 생각해볼 것
- 시스템 프롬프트에 현재 시각을 넣으면 캐시는 어떻게 될까요?
- 원문 5장(caching)도 함께 읽어 보세요.
