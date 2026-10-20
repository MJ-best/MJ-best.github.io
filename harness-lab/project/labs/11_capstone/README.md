# Lab 11 — 캡스톤: 미니 하네스

원문: [Epilogue — Build Your Own](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/16-epilogue-build-your-own.md)

지금까지의 패치를 하나의 몸에 조립했습니다 (`mini_harness.py`, 약 150줄).

```
도구 실행 파이프라인:  todo → 온톨로지 조회 → 문서 검색 → 가드레일 → 기본 도구 → 자르기
두뇌 호출 파이프라인:  캐시 브레이크포인트 → (HARNESS_DEBUG 면 캡처) → 두뇌
시스템 프롬프트:       기본 지침 + 온톨로지(전체 주입) + AGENT.md
```

## 실행
```bash
python labs/11_capstone/mini_harness.py session.json
HARNESS_DEBUG=1 python labs/11_capstone/mini_harness.py
LAB_IMPL=exercise python labs/11_capstone/mini_harness.py   # 내가 푼 코드로 조립
```
명령: `/todo`, `/dump`, `/tokens`, `/steer <말>`, `/quit`

진짜 모델로 해볼 질문:
- "대금지급 전에 검수가 끝나야 해? 근거 문서도 알려줘"
- "26일에 들어온 송장은 언제 지급돼?" (해석 규칙 R1)
- "이 폴더의 파이썬 파일 줄 수를 세서 report.md 로 써줘"

## 채점
`python run_tests.py 11` 은 **내 exercise.py 들로** 조립해서 통합 시나리오를 검사합니다. 1~10을 모두 풀면 통과합니다.

## 다음
루트 README 의 *도전 과제*로.
