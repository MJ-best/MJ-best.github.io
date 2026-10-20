# Lab 9 — RAG는 원래 하네스 패턴이었다

원문: [15장 RAG Was a Harness Pattern All Along](https://github.com/IsuruMaduranga/harness-engineering-101/blob/main/src/15-rag.md)

## 무엇이 깨지나
모델은 우리 회사 규정 문서를 모른다. 전부 프롬프트에 넣기엔 너무 많다(고 가정하자).

## 패치
문서를 청크로 쪼개 색인하고, 질문과 비슷한 top-k 만 배열에 넣는다. 넣는 방식은 둘:
- **사전 주입** (`augment`) — 하네스가 먼저 검색해서 user 메시지 앞에 `<retrieved>` 로 붙인다.
- **검색 도구** (`search_docs`) — 모델이 필요할 때 검색어를 골라 여러 번 검색한다 (agentic RAG).

여기선 의존성 없이 **BM25 + 한글 글자 바이그램**으로 구현합니다. 임베딩으로 바꿔도 하네스 쪽 구조는 같습니다.

## 비용 / 실패 지점
청크로 쪼개는 순간 문서 사이의 **관계가 흩어진다.** top-k 가 연결 고리를 놓치면 모델은 반쪽 근거로 답한다.
`python labs/09_rag/solution.py "대금지급 전에 검수가 끝나야 하나요?"` → `삼자대사`, `입고` 문서가 빠진다. (→ Lab 10)

## 할 일
- `chunk_text` — 문단 묶기
- `Index.score` — BM25 공식
- `Index.search` — 상위 k
- `augment` — 사전 주입 형식

## 생각해볼 것
- 데이터가 문서 8개뿐이라면, 검색을 하는 게 오히려 '누락'이라는 새 실패 지점을 만드는 건 아닐까요?
- 청크 앞에 문서 제목을 붙이면(contextual chunk) 무엇이 좋아질까요?
