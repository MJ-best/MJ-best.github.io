#!/usr/bin/env python3
"""Lab 10 따라 해보기 예제.  실행: python labs/10_ontology/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 카페 메뉴로 만드는 첫 온톨로지
#: 스탠퍼드의 고전 교재 *Ontology Development 101* 은 온톨로지를 이렇게 만들라고 합니다 — ① 범위 정하기 → ② 용어 모으기 → ③ 개념(클래스) 정하기 → ④ 속성 → ⑤ 관계 → ⑥ 규칙. 구매 업무 대신 **카페 메뉴**로 아주 작게 해 봅시다.
#: 새 직원에게 "라떼는 에스프레소에 우유", "카페라테 = 라떼", "샷 추가는 에스프레소 1잔 더"를 알려주는 것과 같습니다.
#? 바꿔 보기: `americano` 의 관계 target 을 `ice` 로 바꾸면 `validate` 가 무엇을 잡아내나요?
import solution as onto_lab

cafe = {
    "domain": "카페", "version": 1,
    "concepts": {
        "espresso": {"label": "에스프레소", "synonyms": ["샷"], "definition": "곱게 간 원두에 고압으로 뽑은 진한 커피.", "relations": []},
        "milk": {"label": "우유", "synonyms": ["밀크"], "definition": "스팀으로 데운 우유.", "relations": []},
        "latte": {"label": "라떼", "synonyms": ["카페라테", "카페 라떼"], "definition": "에스프레소에 스팀 우유를 넣은 음료.",
                  "relations": [{"type": "contains", "target": "espresso"}, {"type": "contains", "target": "milk"}]},
        "americano": {"label": "아메리카노", "synonyms": ["아아"], "definition": "에스프레소에 물을 넣은 음료.",
                      "relations": [{"type": "contains", "target": "espresso"}]},
    },
    "rules": [{"id": "R1", "text": "'샷 추가'는 에스프레소 1잔을 더하는 것이며 500원이다."}],
}
print("설계 검사:", onto_lab.validate(cafe) or "문제 없음")
print("'카페 라떼' →", onto_lab.resolve(cafe, "카페 라떼"), "/ '아아' →", onto_lab.resolve(cafe, "아아"))
print()
print(onto_lab.render_for_prompt(cafe))

# %% 조직 용어 번역기
#: 같은 것을 부서마다 다르게 부릅니다. 구매팀은 "PO", 현업은 "오더", 회계는 "구매오더". 온톨로지의 **동의어**가 이것을 하나의 개념으로 묶어 줍니다. 띄어쓰기·대소문자·하이픈도 무시합니다.
#? 바꿔 보기: 목록에 "벤더", "인보이스", "점심메뉴"를 넣어 보세요.
import solution as onto_lab

onto = onto_lab.load_ontology()
for term in ["PO", "오더", "삼자 대사", "3-way match", "QC검사", "세금계산서", "협력사", "마감"]:
    cid = onto_lab.resolve(onto, term)
    label = onto["concepts"][cid]["label"] if cid else "❓ 모름 (개념이 아님)"
    print(f"{term:<12} → {cid or '-':<16} {label}")

# %% 지도에서 길 찾기: multi-hop 경로
#: 질문에 등장하지 않는 **중간 개념**도 관계를 따라가면 찾을 수 있습니다. 이게 RAG 가 놓친 고리를 온톨로지가 잡는 방법입니다.
#? 바꿔 보기: ("supplier", "inspection") 경로를 찾아 보세요. 몇 단계인가요?
import solution as onto_lab

onto = onto_lab.load_ontology()
for a, b in [("대금지급", "검수"), ("송장", "단가계약"), ("발주", "대금지급")]:
    path = onto_lab.find_path(onto, onto_lab.resolve(onto, a), onto_lab.resolve(onto, b))
    print(f"{a} ↔ {b}  ({len(path)}단계)")
    print("   " + onto_lab.explain_path(onto, path))

# %% GraphRAG 맛보기: 지도로 검색어를 넓히기
#: Lab 9 의 RAG 는 고리를 놓쳤습니다. 온톨로지 경로에 나온 개념 이름으로 **검색어를 넓히면** 필요한 문서가 모두 걸립니다. 관계는 그래프에서, 설명은 문서 검색에서 — 이것이 GraphRAG 의 가장 단순한 형태입니다.
import solution as onto_lab
from common.labkit import load_lab

rag = load_lab("09_rag")
onto = onto_lab.load_ontology()
index = rag.Index(rag.load_docs())
q = "대금지급 전에 검수가 끝나야 하나요?"

path = onto_lab.find_path(onto, "payment", "inspection")
nodes = {n for s, _, d in path for n in (s, d)}
expanded = q + " " + " ".join(onto["concepts"][n]["label"] + " " + " ".join(onto["concepts"][n]["synonyms"]) for n in sorted(nodes))

before = sorted({c["source"] for _, c in index.search(q, k=4)})
after = sorted({c["source"] for _, c in index.search(expanded, k=4)})
print("넓힌 검색어:", expanded[:70], "…\n")
print("RAG 만      :", before)
print("지도 + RAG  :", after)

# %% 어느 단계로 갈까? 확장 판단표
#: 데이터가 작을 땐 **전체 주입**이 출발점입니다. 커지면 조회 도구, 인스턴스가 많고 관계 탐색이 핵심이면 그래프로 넘어갑니다.
import solution as onto_lab

cases = [
    ("우리 구매 온톨로지 (지금)", 750, 0, False),
    ("개념 300개짜리 전사 용어집", 30_000, 0, False),
    ("발주 5만 건 + 공급망 추적", 3_000, 50_000, True),
]
for name, tokens, instances, hops in cases:
    print(f"{name:<22} → {onto_lab.decide_strategy(tokens, 200_000, instances, hops)}")
