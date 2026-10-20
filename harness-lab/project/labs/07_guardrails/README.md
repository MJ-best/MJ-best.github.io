# Lab 7 — 반사신경과 가드레일

원문: [13-reflexes-and-guardrails.md](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/13-reflexes-and-guardrails.md)

## 무엇이 깨지나
모델은 확신에 차서 `.env` 를 덮어쓰거나 `rm -rf` 를 실행한다.

## 패치
하네스 코드에서 규칙으로 막는다: 보호 경로 쓰기 금지, 읽지 않은 기존 파일 덮어쓰기 금지, 위험 명령은 사람 승인. 거부는 예외가 아니라 `BLOCKED: 이유` 문자열로 돌려줘서 모델이 다른 길을 찾게 한다.

## 비용
정규식 기반 탐지는 우회될 수 있다. 진짜 격리(컨테이너, 권한)는 별도.

## 할 일 (`exercise.py`)
- `Guard.check` 세 규칙

```bash
python run_tests.py 7 -v
```

## 생각해볼 것
- `DANGEROUS` 패턴을 우회하는 명령을 떠올려 보세요. 무엇으로 보완할까요?
- 부록 C(플랜 모드)는 이 아이디어를 '상태'로 확장합니다.
