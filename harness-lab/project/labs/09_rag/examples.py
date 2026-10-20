#!/usr/bin/env python3
"""Lab 9 따라 해보기 예제.  실행: python labs/09_rag/examples.py"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path[:0] = [HERE, ROOT]
os.chdir(ROOT)

# %% 오픈북 시험: RAG 한 장 요약
#: **비유** — RAG 는 *오픈북 시험*입니다. 책 전체를 외우게 하는 대신(학습), 시험 문제와 관련된 **페이지 몇 장만 펴서** 옆에 놓아 줍니다(검색 → 주입).
#: 핵심은 "어떤 페이지를 펴 줄 것인가"이고, 그건 모델이 아니라 **하네스 코드**가 정합니다.
#? 바꿔 보기: 질문을 "식당은 몇 시까지 해?"로 바꿔 보세요. 구매 문서 대신 식당 공지가 뽑힙니다.
import solution as rag

index = rag.Index(rag.load_docs())
question = "어음으로 지급해도 되나요?"
print(f"책(청크) {len(index.chunks)}장 중에서 관련 페이지를 고릅니다.\n")
q_tokens = set(rag.tokenize(question))
for score, chunk in index.search(question, k=2):
    # 청크에서 질문과 가장 많이 겹치는 문장을 보여 준다
    best = max(chunk["text"].splitlines(), key=lambda line: len(set(rag.tokenize(line)) & q_tokens))
    print(f"📄 {chunk['id']}  (점수 {score:.2f})")
    print("   " + best[:60] + "\n")

# %% 한국어 검색의 요령: 글자 바이그램
#: "대금지급은"과 "지급"은 형태소 분석기 없이는 일치하지 않습니다. 단어를 **두 글자씩 겹쳐 자르면**(바이그램) "지급"이 공통 조각으로 잡힙니다.
#? 바꿔 보기: 자기 이름이나 회사 용어를 넣어 어떻게 쪼개지는지 보세요.
import solution as rag

for w in ["대금지급은", "지급", "3-Way Match 통제"]:
    print(f"{w!r:20} → {rag.tokenize(w)}")
common = set(rag.tokenize("대금지급은")) & set(rag.tokenize("지급"))
print("\n공통 조각:", common)

# %% BM25 점수표: 드문 단어가 점수를 만든다
#: BM25 는 "질문의 단어가 이 청크에 얼마나 나오나" × "그 단어가 얼마나 **드문가**(idf)"를 더합니다. 모든 문서에 나오는 어미 "니다"나 여러 문서에 나오는 "송장"보다, 한 문서에만 나오는 "어음"이 훨씬 강한 단서입니다.
#? 바꿔 보기: "입고", "공급" 같은 단어를 넣어 문서빈도와 idf 를 비교해 보세요.
import solution as rag

index = rag.Index(rag.load_docs())
for term in ["어음", "송장", "발주", "니다"]:
    print(f"'{term}'  문서빈도 {index.df.get(term, 0)}/{len(index.chunks)}   idf {index.idf(term):.2f}")

# %% 같은 정보, 두 가지 주입 방식
#: **사전 주입** — 하네스가 먼저 검색해 질문 앞에 붙입니다. 모델은 검색이 있었는지도 모릅니다.
#: **검색 도구** — `search_docs` 도구를 주면 모델이 검색어를 직접 골라 여러 번 찾을 수 있습니다(agentic RAG). 아래는 사전 주입된 user 메시지의 실제 모습입니다.
import solution as rag

index = rag.Index(rag.load_docs())
print(rag.augment(index, "송장에 발주번호가 없으면?", k=1))

# %% 연결 고리를 놓치는 RAG
#: "대금지급 전에 검수가 끝나야 하나요?" — 답하려면 **대금지급 → 삼자대사 → 입고 → 검수** 를 이어야 합니다. 그런데 질문에 없는 중간 단어(삼자대사·입고) 문서는 top-3 에 잘 안 뽑힙니다. 청크 검색의 구조적 한계이고, Lab 10 의 온톨로지가 이 틈을 메웁니다.
import solution as rag

index = rag.Index(rag.load_docs())
need = {"06_대금지급_규정.md", "05_대사_통제.md", "02_입고_처리.md", "03_수입검사_기준.md"}
got = {c["source"] for _, c in index.search("대금지급 전에 검수가 끝나야 하나요?", k=3)}
print("필요한 문서:", sorted(need))
print("top-3 결과 :", sorted(got))
print("놓친 고리  :", sorted(need - got))
