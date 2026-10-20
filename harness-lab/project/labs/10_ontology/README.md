# Lab 10 — 온톨로지: 에이전트에게 도메인 지도 입히기

참고: 장한별, [「그래서 Agent에 데이터를 어떻게 입히나요?」](https://bigstargithub.github.io/posts/AI-12/)

## 무엇이 깨지나
LLM 은 일반 지식은 많지만 **우리 조직에서 그 용어가 무엇을 뜻하는지** 모른다.
'마감'이 매월 25일 매입 마감이라는 것, 'PO'·'구매오더'·'오더'가 같은 것이라는 것, 대금지급이 삼자대사를 거쳐 검수에 걸려 있다는 것.

## 패치
**온톨로지** = 개념 · 관계 · 속성 · 해석 규칙을 명시적으로 정의한 문서 (`data/procurement/ontology.yaml`).
데이터가 작을 때는 저장소를 고르기 전에 **온톨로지 설계부터**, 그리고 다음 순서로 확장한다.

| 단계 | 하네스에서 | 언제 | 이 랩의 함수 |
|---|---|---|---|
| 1. 전체 주입 | 시스템 프롬프트에 통째로 | 작을 때 (출발점) | `render_for_prompt`, `build_system` |
| 2. 조회 도구 | `ontology_lookup` 으로 섹션만 | 컨텍스트 비중이 커지면 | `lookup` (들어오는 관계 포함) |
| 3. 그래프 | 경로 탐색 결과를 도구로 | 인스턴스 증가, multi-hop | `find_path` (BFS) |

언제 넘어갈지는 `decide_strategy` 로 규칙화해 봅니다.

## 비용
- 1단계: 컨텍스트를 상시 점유. 대신 시스템 프롬프트(고정 prefix)라 캐시가 잘 된다 (Lab 4).
- 2단계: 모델이 조회를 안 하거나, 개념이 아닌 '규칙'에 있는 용어('마감')는 못 찾는다 — 테스트 `test_lookup_tool_in_loop` 참고.
- 3단계: 운영·스키마 관리 비용. 쿼리를 잘못 만들면 **확신을 갖고 틀린다.**

## 할 일
- `validate` — 깨진 관계, 용어 충돌, 누락 검사 (설계 품질!)
- `resolve` — 조직 용어 → 개념 id
- `render_for_prompt` — 1단계
- `lookup` — 2단계 (들어오는 관계·관련 규칙)
- `find_path` — 3단계 multi-hop

## 확인
`test_injection_beats_rag_on_multi_hop` 은 같은 질문에 대해 RAG top-3 은 고리를 놓치고, 전체 주입은 고리가 모두 프롬프트에 있음을 보여 줍니다.

## 생각해볼 것
- `ontology.yaml` 에 개념을 하나 추가해 보세요 (예: 반품). `validate` 가 무엇을 잡아주나요? (YAML 수정 후 `python scripts/yaml_to_json.py`)
- 잘 만든 YAML 은 그래프 스키마로 옮기기 쉽습니다. `edges()` 출력을 Cypher `CREATE` 문으로 바꿔 보세요.
- GraphRAG: `find_path` 결과의 각 노드에 Lab 9 검색 결과를 붙여 돌려주는 도구를 만들어 보세요.
