#!/usr/bin/env python3
"""Lab 9 — RAG는 원래 하네스 패턴이었다.

RAG(검색 증강 생성)도 결국 "배열에 무엇을 넣을지" 고르는 하네스 코드입니다.
  색인  : 문서를 청크로 쪼개고 검색할 수 있게 만든다
  검색  : 질문과 비슷한 청크 top-k 를 고른다
  주입  : 두 가지 방식
          (a) 사전 주입 — 하네스가 먼저 검색해 user 메시지에 붙인다 (모델은 검색을 모름)
          (b) 도구 방식 — search_docs 도구를 주고 모델이 필요할 때 검색한다 (agentic RAG)

외부 라이브러리 없이 BM25 + 한글 글자 바이그램으로 구현합니다.
(임베딩 벡터 검색으로 바꿔도 하네스 쪽 구조는 똑같습니다)

실패 지점: 청크로 쪼개는 순간 문서 사이의 '관계'가 흩어지고, top-k 가 연결 고리를
놓칠 수 있습니다. 이 한계를 Lab 10 온톨로지와 비교합니다.

실행:  python labs/09_rag/solution.py "대금지급 조건이 뭐야?"
"""
import glob
import math
import os
import re
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
DOCS_DIR = os.path.join(ROOT, "data", "procurement", "docs")


# --------------------------------------------------------------- 토큰화 (제공)
def tokenize(text):
    """영숫자 단어는 그대로, 한글 단어는 글자 바이그램으로 쪼갠다.
    '대금지급은' → ['대금', '금지', '지급', '급은']  (형태소 분석기 없이도 부분 일치 가능)"""
    tokens = []
    for w in re.findall(r"[가-힣]+|[a-zA-Z0-9]+", text.lower()):
        if re.match(r"[가-힣]", w) and len(w) >= 2:
            tokens += [w[i:i + 2] for i in range(len(w) - 1)]
        else:
            tokens.append(w)
    return tokens


# ------------------------------------------------------------------ 청크 나누기
def chunk_text(text, source, max_chars=200):
    """빈 줄로 문단을 나누고, 문단을 순서대로 이어 붙이다가 max_chars 를 넘으면 새 청크를 시작한다.
    (문단 하나가 max_chars 보다 길면 그 문단 혼자 한 청크)
    반환: [{"id": f"{source}#{i}", "source": source, "text": ...}, ...]  (i 는 0부터)
    문단 사이는 "\\n\\n" 으로 잇는다."""
    # >>> TODO: 문단 단위로 묶어 청크 리스트를 만드세요
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        if cur and len(cur) + 2 + len(p) > max_chars:
            chunks.append(cur)
            cur = p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        chunks.append(cur)
    return [{"id": f"{source}#{i}", "source": source, "text": c} for i, c in enumerate(chunks)]
    # <<< TODO


def load_docs(docs_dir=DOCS_DIR, max_chars=200):
    chunks = []
    for path in sorted(glob.glob(os.path.join(docs_dir, "*.md"))):
        with open(path, encoding="utf-8") as f:
            chunks += chunk_text(f.read(), os.path.basename(path), max_chars)
    return chunks


# ----------------------------------------------------------------------- 색인
class Index:
    K1, B = 1.5, 0.75

    def __init__(self, chunks):
        self.chunks = chunks
        self.tfs = [Counter(tokenize(c["text"])) for c in chunks]
        self.lens = [sum(tf.values()) for tf in self.tfs]
        self.avglen = sum(self.lens) / max(len(self.lens), 1)
        self.df = Counter(t for tf in self.tfs for t in tf)

    def idf(self, term):
        n, df = len(self.chunks), self.df.get(term, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def score(self, query_tokens, i):
        """BM25 점수:  Σ_t idf(t) · tf·(K1+1) / (tf + K1·(1 − B + B·len/avglen))
        t 는 질문 토큰(중복 제거), tf 는 청크 i 에서 t 의 빈도. tf=0 이면 기여 0."""
        # >>> TODO: 위 공식을 구현하세요
        tf, length, s = self.tfs[i], self.lens[i], 0.0
        for t in set(query_tokens):
            f = tf.get(t, 0)
            if f:
                s += self.idf(t) * f * (self.K1 + 1) / (
                    f + self.K1 * (1 - self.B + self.B * length / self.avglen))
        return s
        # <<< TODO

    def search(self, query, k=3):
        """점수가 0 보다 큰 청크를 점수 내림차순으로 k 개. [(score, chunk), ...]"""
        # >>> TODO: 모든 청크를 채점하고 정렬해 상위 k 개를 반환하세요
        q = tokenize(query)
        scored = [(self.score(q, i), c) for i, c in enumerate(self.chunks)]
        scored = [x for x in scored if x[0] > 0]
        scored.sort(key=lambda x: -x[0])
        return scored[:k]
        # <<< TODO


def format_hits(hits):
    """검색 결과를 모델이 출처를 인용할 수 있는 형태로."""
    if not hits:
        return "(검색 결과 없음)"
    return "\n\n".join(f'<doc id="{c["id"]}">\n{c["text"]}\n</doc>' for _, c in hits)


# ------------------------------------------------------- 하네스에 끼우는 두 방식
def augment(index, question, k=3):
    """(a) 사전 주입: 검색 결과를 <retrieved> 로 감싸 질문 '앞'에 붙인 user 메시지 문자열.
    형식:
        <retrieved>
        {format_hits(...)}
        </retrieved>

        질문: {question}
    """
    # >>> TODO: 위 형식대로 문자열을 만드세요
    return f"<retrieved>\n{format_hits(index.search(question, k))}\n</retrieved>\n\n질문: {question}"
    # <<< TODO


SEARCH_TOOL = {
    "name": "search_docs",
    "description": "사내 구매 규정 문서를 키워드로 검색해 관련 단락을 출처 id와 함께 돌려준다.",
    "input_schema": {"type": "object",
                     "properties": {"query": {"type": "string"},
                                    "k": {"type": "integer"}},
                     "required": ["query"]},
}


def make_search_executor(index, base_execute):
    """(b) 도구 방식: search_docs 는 index 로, 나머지는 base_execute 로."""
    def execute(name, args):
        if name == "search_docs":
            return format_hits(index.search(args["query"], int(args.get("k", 3))))
        return base_execute(name, args)
    return execute


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or "대금지급 전에 검수가 끝나야 하나요?"
    idx = Index(load_docs())
    print(f"청크 {len(idx.chunks)}개 색인 / 질문: {q}\n")
    for s, c in idx.search(q, k=3):
        print(f"{s:6.2f}  {c['id']}  {c['text'][:60].replace(chr(10), ' ')}…")
