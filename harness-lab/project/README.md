# Harness Lab — 하네스 엔지니어링 실습

> **LLM은 두뇌, 하네스는 몸이다.**
> LLM API는 상태가 없다. 매 턴 대화 전체를 JSON 배열로 보내고 텍스트를 돌려받을 뿐이다.
> *하네스*는 그 배열을 만들고, 유지하고, 지키는 프로그램이다.
> "에이전트"라고 부르는 모든 것은 이 루프 하나에 붙인 패치들이고, 각 패치는 뭔가가 실제로 깨졌기 때문에 생겼다.

이 저장소는 [Harness Engineering 101](https://github.com/IsuruMaduranga/harness-engineering-101)(Isuru Wijesiri)의 흐름을 따라
**직접 빈칸을 채우며 하네스를 처음부터 만들어 보는 실습 랩**입니다.
여기에 [「그래서 Agent에 데이터를 어떻게 입히나요?」](https://bigstargithub.github.io/posts/AI-12/)(장한별)의 관점을 더해
**RAG와 온톨로지**를 하네스 패턴으로 다루는 랩 두 개를 추가했습니다.

- **의존성 0** — 파이썬 3.10+ 표준 라이브러리만 (PyYAML은 있으면 사용, 없어도 됨)
- **API 키 없이도** 모든 랩을 풀고 채점할 수 있음 (`ScriptedBrain`, `FakeBrain`)
- 키가 있으면 같은 코드가 진짜 Claude로 동작 (`ANTHROPIC_API_KEY`)

> 📱 **웹 워크북: <https://mj-best.github.io/harness-lab/>**
> 설치 없이 휴대폰 브라우저에서 개념 → 퀴즈 → 코드 채우기 → 자동 채점(브라우저 속 파이썬)까지 진행할 수 있습니다.
> 사이트는 `python scripts/build_site.py --zip` 으로 `site/` 에 다시 만들 수 있습니다.

---

## 빠른 시작

```bash
cd harness-lab
python run_tests.py --solution   # 설치 확인: 11/11 통과해야 정상
python run_tests.py 1            # Lab 1 채점 (처음엔 ❌ 가 정상)
# labs/01_array/exercise.py 의 TODO 를 채운 뒤 다시
python run_tests.py 1 -v
```

진짜 모델로 대화해 보기:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HARNESS_MODEL=claude-sonnet-5-5      # 선택
python labs/03_agent_loop/exercise.py       # 내가 만든 에이전트!
```

키가 없으면 자동으로 `FakeBrain`이 붙습니다. `read 파일`, `run 명령`, `write 경로 내용`, `ask 작업` 같은 입력에 도구 호출로 반응합니다.

---

## 커리큘럼

각 랩은 같은 모양입니다: **무엇이 깨지는가 → 최소한의 패치 → 그 패치의 비용**.

| # | 랩 | 깨지는 것 | 만드는 것 | 원문 |
|---|---|---|---|---|
| 1 | `01_array` | "이걸로 어떻게 대화하지?" | 메시지 배열, 세션 파일 | 1장 |
| 2 | `02_tools` | 두뇌는 세상을 만질 수 없다 | 도구 스키마 + 디스패치 | 3장 |
| 3 | `03_agent_loop` | 도구 한 번으론 부족하다 | `stop_reason` 루프, 폭주 방지 | 4장 |
| 4 | `04_context_budget` | 배열이 비싸지고 창이 찬다 | 결과 자르기, 캐시 브레이크포인트, 메모리 파일 | 5·6장 |
| 5 | `05_subagents` | 한 배열에 모든 일을 담을 수 없다 | 컨텍스트 포크 | 7장 |
| 6 | `06_steering` | 두뇌가 작업 중 표류한다 | 리마인더 큐, todo | 8장 |
| 7 | `07_guardrails` | 루프는 언젠가 멍청한 짓을 한다 | 보호 경로, 읽고-쓰기, 승인 게이트 | 13장 |
| 8 | `08_debugging` | 안 보이는 프롬프트는 못 고친다 | 요청 캡처, 캐시 활력징후, prefix 비교 | 12장 |
| 9 | `09_rag` | 모델은 우리 문서를 모른다 | BM25 검색, 사전 주입 vs 검색 도구 | 15장 |
| 10 | `10_ontology` | 모델은 우리 *용어*를 모른다 | YAML 온톨로지, 전체 주입 → 조회 도구 → 그래프 | 블로그 |
| 11 | `11_capstone` | — | 전부 조립한 미니 하네스 | 16장 |

권장 진행: 하루 1~2개 랩. 각 랩 폴더의 `README.md` → `examples.py`(따라 해보기) → `exercise.py`의 TODO → `python run_tests.py N`.

### 따라 해보기 예제 (`labs/*/examples.py`)

랩마다 2~5개, 모두 34개의 짧고 구체적인 예제가 있습니다. 비유 한 줄, 20~40줄 코드, 실제 출력, "바꿔 보기" 과제로 구성됩니다.
예: 금붕어 기억력(Lab 1), 날씨 도구(Lab 2), 로그 2만 줄 자르기·캐시 비용 계산(Lab 4), 거부 이유를 읽고 스스로 고치는 모델(Lab 7), 오픈북 시험 RAG(Lab 9), 카페 메뉴 온톨로지·GraphRAG 맛보기(Lab 10).

```bash
python labs/04_context_budget/examples.py   # 그 랩의 예제를 모두 실행
python run_tests.py --examples              # 모든 예제가 돌아가는지 확인
```

추천 교재 목록은 워크북 사이트의 **교재** 페이지(`workbook/resources.json`)에 있습니다.

---

## 큰 그림

```
            ┌──────────────────────── 하네스 (몸) ────────────────────────┐
 사용자 ──▶ │  배열 = [system(+온톨로지), user, assistant, tool_result…]     │
            │     │                                       ▲               │
            │     ▼  요청(배열 전체 + 도구 스키마)          │ 결과 덧붙이기  │
            │  ┌────────┐   tool_use    ┌──────────────────┴────────────┐  │
            │  │  두뇌  │ ────────────▶ │ 가드레일 → 도구 실행 → 자르기     │  │
            │  │ (LLM)  │ ◀──────────── │ (파일·셸·검색·온톨로지·서브에이전트)│  │
            │  └────────┘  end_turn     └───────────────────────────────┘  │
            │        리마인더/todo 는 다음 user 메시지 끝에 주입               │
            └─────────────────────────────────────────────────────────────┘
```

### RAG와 온톨로지는 어디에 끼나?

둘 다 결국 **"배열에 무엇을, 언제, 어디에 넣을지"** 의 문제입니다.

| 방식 | 배열의 어디에 | 강점 | 실패 지점 |
|---|---|---|---|
| 온톨로지 전체 주입 | 시스템 프롬프트 (고정 prefix → 캐시됨) | 누락 없음, 고치기·디버깅 쉬움 | 커지면 컨텍스트를 잡아먹음 |
| 온톨로지 조회 도구 | 필요할 때 tool_result 로 | 컨텍스트 절약 | 모델이 조회를 안 하거나 잘못된 용어로 조회 |
| RAG 사전 주입 | 사용자 메시지 앞 | 모델이 검색을 몰라도 됨 | top-k 가 연결 고리를 놓침 |
| RAG 검색 도구 | tool_result 로 | 여러 번 다시 검색 가능 | 검색어 선택을 모델에 의존 |
| 그래프 탐색 | 도구 결과로 경로를 | multi-hop 관계에 강함 | 운영 비용, 쿼리가 틀리면 확신 있게 틀림 |

Lab 9·10은 같은 질문 *"대금지급 전에 검수가 끝나야 하나요?"* 으로 이 차이를 직접 확인합니다.
RAG top-3 은 `대금지급`·`검수` 문서는 찾지만 둘을 잇는 `삼자대사`·`입고` 문서를 놓치고,
온톨로지는 `대금지급 -requires→ 3-Way Match -compares→ 입고 -requires→ 검수` 경로를 그대로 보여 줍니다.

---

## 폴더 구조

```
harness-lab/
├─ common/            두뇌 백엔드(brain.py), 기본 도구(toolbox.py), 참고 루프(loop.py)
├─ data/procurement/  실습용 도메인: 구매 규정 문서 8개 + 온톨로지(YAML/JSON)
├─ labs/NN_*/         README.md · exercise.py(풀 것) · solution.py(정답) · test_lab.py
├─ scripts/           make_exercises.py(정답→연습 생성), yaml_to_json.py
└─ run_tests.py       채점기
```

`common/`에는 앞선 랩의 참고 구현이 들어 있어서 뒤 랩이 그걸 가져다 씁니다.
스포일러가 싫다면 **랩 순서대로** 진행하세요.

## 디버깅 팁

- `HARNESS_DEBUG=1 python labs/11_capstone/mini_harness.py` → `harness_debug.jsonl` 에 모든 요청·응답 기록
- `python labs/08_debugging/solution.py harness_debug.jsonl` → 요청별 크기·캐시 적중률·prefix 깨짐 표시
- 캡스톤 안에서 `/dump`, `/tokens`, `/todo`, `/steer 말`

## 더 해볼 것 (도전 과제)

1. **스트리밍** — `stream: true` 로 SSE 를 파싱해 토큰 단위로 출력 (원문 부록 D)
2. **재시도·레이트리밋** — 429/529 에 지수 백오프 (부록 D)
3. **백그라운드 작업** — `run_command(background=true)` + 완료 알림을 리마인더로 (9장)
4. **플랜 모드** — 쓰기 도구를 잠그는 하네스 상태 (부록 C)
5. **모델 라우팅** — 서브에이전트는 작은 모델로 (부록 A)
6. **임베딩 RAG** — `Index` 를 벡터 검색으로 교체하고 BM25 와 하이브리드로
7. **GraphRAG** — 온톨로지 경로 + 각 노드 관련 문서 청크를 함께 돌려주는 도구
8. **온톨로지 인스턴스** — 실제 발주·입고 데이터를 SQLite 에 넣고 조회 도구로 연결
9. **MCP** — 도구 상자를 MCP 서버로 분리해 같은 하네스에 꽂기 (11장)

---

## 출처와 라이선스

- 개념과 커리큘럼 흐름: *Harness Engineering 101* © 2026 Isuru Wijesiri —
  본문은 CC BY-NC-ND 4.0, 코드는 MIT. 이 랩은 원문 문장을 옮기지 않고 한국어로 새로 쓴 학습 자료이며, 원문은 [온라인 책](https://isuruwijesiri.com/harness-engineering-101/)에서 읽으세요.
- 온톨로지 확장 순서(전체 주입 → 섹션 조회 도구 → GraphDB/RAG): 장한별, [「그래서 Agent에 데이터를 어떻게 입히나요?」](https://bigstargithub.github.io/posts/AI-12/)
- 이 저장소의 코드: MIT
