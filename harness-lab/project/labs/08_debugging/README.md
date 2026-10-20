# Lab 8 — 배열 디버깅

원문: [12-debugging-the-array.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/12-debugging-the-array.md)

## 무엇이 깨지나
에이전트가 이상하게 굴 때 '모델이 실제로 본 것'을 모른다.

## 패치
모든 요청·응답을 JSONL 로 캡처, `usage` 로 캐시 적중률(활력징후) 계산, 이전/이번 요청의 prefix 가 어디서 갈라졌는지 비교.

## 비용
캡처 파일엔 비밀이 들어갈 수 있다. 커밋 금지.

## 할 일 (`exercise.py`)
- `CapturingBrain`
- `cache_hit_ratio`
- `first_divergence`

```bash
python run_tests.py 8 -v
```

## 생각해볼 것
- `HARNESS_DEBUG=1` 로 캡스톤을 돌리고 `python labs/08_debugging/solution.py harness_debug.jsonl` 로 요약을 보세요.
