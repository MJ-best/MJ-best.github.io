#!/usr/bin/env python3
"""Lab 10 — 온톨로지: 에이전트에게 '도메인 지도' 입히기.

LLM 은 일반 지식은 많지만 "우리 조직에서 '마감'이 뭘 뜻하는지"는 모릅니다.
온톨로지 = 개념 · 관계 · 속성 · 해석 규칙을 명시적으로 적은 문서.

데이터가 작을 때의 출발점과 확장 순서:
  1단계 전체 주입 : YAML 을 렌더링해 시스템 프롬프트에 '통째로'. 검색 누락이 원천적으로 없음.
  2단계 조회 도구 : 커지면 ontology_lookup 도구로 필요한 섹션만 꺼내 보게 한다.
  3단계 그래프   : 인스턴스가 많고 multi-hop 탐색이 잦으면 그래프 탐색(GraphDB/GraphRAG).
저장소보다 먼저 '온톨로지 설계'가 중요합니다. 잘 만든 YAML 은 그래프 스키마로 옮기기 쉽습니다.

실행:  python labs/10_ontology/solution.py            (렌더링 결과와 경로 탐색 예시 출력)
"""
import json
import os
import sys
from collections import deque

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
DATA = os.path.join(ROOT, "data", "procurement")


def load_ontology(path=os.path.join(DATA, "ontology.yaml")):
    """PyYAML 이 있으면 YAML, 없으면 같은 이름의 .json 을 읽는다."""
    try:
        import yaml
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    except ImportError:
        with open(os.path.splitext(path)[0] + ".json", encoding="utf-8") as f:
            return json.load(f)


def _norm(term):
    return term.lower().replace(" ", "").replace("-", "")


# ------------------------------------------------------------------ 설계 검증
def validate(onto):
    """온톨로지의 설계 오류를 문자열 리스트로 반환 (없으면 []).
    - 개념에 label 또는 definition 이 없음      → "<id>: label/definition 누락"
    - 관계의 target 이 정의되지 않은 개념        → "<id>: 알 수 없는 target <target>"
    - 같은 용어(label·synonym, _norm 기준)가 두 개념에 쓰임 → "용어 충돌: <term>"
    """
    # >>> TODO: 세 가지 검사를 구현하세요
    errors, seen = [], {}
    concepts = onto.get("concepts", {})
    for cid, c in concepts.items():
        if not c.get("label") or not c.get("definition"):
            errors.append(f"{cid}: label/definition 누락")
        for r in c.get("relations") or []:
            if r["target"] not in concepts:
                errors.append(f"{cid}: 알 수 없는 target {r['target']}")
        for term in [c.get("label", "")] + list(c.get("synonyms") or []):
            key = _norm(term)
            if key and seen.setdefault(key, cid) != cid:
                errors.append(f"용어 충돌: {term}")
    return errors
    # <<< TODO


def resolve(onto, term):
    """조직 용어(id·label·동의어, 대소문자/공백/하이픈 무시)를 개념 id 로. 없으면 None."""
    # >>> TODO: _norm 으로 비교해 일치하는 개념 id 를 반환하세요
    key = _norm(term)
    for cid, c in onto["concepts"].items():
        if key in {_norm(cid), _norm(c["label"])} | {_norm(s) for s in c.get("synonyms") or []}:
            return cid
    return None
    # <<< TODO


# ----------------------------------------------------------- 1단계: 전체 주입
def render_concept(onto, cid):
    c = onto["concepts"][cid]
    syn = f" (= {', '.join(c['synonyms'])})" if c.get("synonyms") else ""
    lines = [f"[{cid}] {c['label']}{syn}", f"  정의: {c['definition']}"]
    if c.get("attributes"):
        lines.append(f"  속성: {', '.join(c['attributes'])}")
    rels = [f"{r['type']} → {r['target']}({onto['concepts'][r['target']]['label']})"
            for r in c.get("relations") or []]
    if rels:
        lines.append(f"  관계: {'; '.join(rels)}")
    return "\n".join(lines)


def render_for_prompt(onto):
    """온톨로지 전체를 시스템 프롬프트용 텍스트로.
    형식:
        <ontology domain="..." version="...">
        (개념마다 render_concept, 빈 줄로 구분)

        해석 규칙:
        - R1: ...
        </ontology>
    """
    # >>> TODO: 위 형식대로 렌더링하세요
    parts = [f'<ontology domain="{onto["domain"]}" version="{onto.get("version", 1)}">']
    parts.append("\n\n".join(render_concept(onto, cid) for cid in onto["concepts"]))
    if onto.get("rules"):
        parts.append("\n해석 규칙:\n" + "\n".join(f"- {r['id']}: {r['text']}" for r in onto["rules"]))
    parts.append("</ontology>")
    return "\n".join(parts)
    # <<< TODO


def build_system(base, onto):
    return (f"{base}\n\n아래 온톨로지는 이 조직의 용어 정의다. 일반 상식보다 이 정의를 우선하라."
            f"\n\n{render_for_prompt(onto)}")


# ----------------------------------------------------------- 2단계: 조회 도구
ONTOLOGY_TOOL = {
    "name": "ontology_lookup",
    "description": "도메인 용어(동의어 가능)의 정의·속성·관계(들어오는 관계 포함)와 관련 규칙을 조회한다.",
    "input_schema": {"type": "object",
                     "properties": {"term": {"type": "string"}},
                     "required": ["term"]},
}


def lookup(onto, term):
    """도구 결과 문자열. 모르는 용어면 "UNKNOWN: <term> (알려진 개념: ...)".
    아는 용어면 render_concept + '들어오는 관계' 줄 + 개념 label 이 언급된 규칙들."""
    cid = resolve(onto, term)
    if cid is None:
        known = ", ".join(c["label"] for c in onto["concepts"].values())
        return f"UNKNOWN: {term} (알려진 개념: {known})"
    out = [render_concept(onto, cid)]
    # >>> TODO: 다른 개념에서 cid 로 향하는 관계를 "  들어오는 관계: <src>(<label>) -<type>→" 형식으로 모아 추가하고,
    #           text 에 이 개념의 label 이 들어간 규칙을 "  규칙 R?: ..." 로 추가하세요
    incoming = [f"{src}({c['label']}) -{r['type']}→"
                for src, c in onto["concepts"].items()
                for r in c.get("relations") or [] if r["target"] == cid]
    if incoming:
        out.append(f"  들어오는 관계: {'; '.join(incoming)}")
    label = onto["concepts"][cid]["label"]
    out += [f"  규칙 {r['id']}: {r['text']}" for r in onto.get("rules") or [] if label in r["text"]]
    return "\n".join(out)
    # <<< TODO


# --------------------------------------------------------- 3단계: 그래프 탐색
def edges(onto):
    """[(src, type, dst), ...] 모든 관계."""
    return [(src, r["type"], r["target"])
            for src, c in onto["concepts"].items() for r in c.get("relations") or []]


def find_path(onto, start, goal, max_depth=4):
    """관계를 '방향 무시'하고 BFS 로 start→goal 최단 경로를 찾는다.
    반환: 원래 방향을 유지한 간선 리스트 [(src, type, dst), ...]. 없으면 None. start==goal 이면 [].
    예) payment→inspection:
        [("payment","requires","three_way_match"),
         ("three_way_match","compares","goods_receipt"),
         ("goods_receipt","requires","inspection")]"""
    # >>> TODO: 인접 리스트(양방향)를 만들고 BFS 하세요. 경로 길이가 max_depth 를 넘으면 탐색하지 마세요
    adj = {}
    for e in edges(onto):
        src, _, dst = e
        adj.setdefault(src, []).append((dst, e))
        adj.setdefault(dst, []).append((src, e))
    queue, seen = deque([(start, [])]), {start}
    while queue:
        node, path = queue.popleft()
        if node == goal:
            return path
        if len(path) >= max_depth:
            continue
        for nxt, e in adj.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                queue.append((nxt, path + [e]))
    return None
    # <<< TODO


def explain_path(onto, path):
    lab = lambda cid: onto["concepts"][cid]["label"]  # noqa: E731
    return " → ".join(f"{lab(s)} -{t}→ {lab(d)}" for s, t, d in path)


# --------------------------------------------------------------- 어떤 단계?
def decide_strategy(prompt_tokens, context_budget, n_instances=0, multi_hop_heavy=False):
    """확장 판단 (글의 순서를 단순화한 규칙):
    - 인스턴스가 1만 개 이상이거나 multi-hop 탐색이 핵심이면  → "graph"
    - 온톨로지 프롬프트가 컨텍스트 예산의 10% 를 넘으면      → "lookup_tool"
    - 그 밖에는                                               → "inject"
    """
    if n_instances >= 10_000 or multi_hop_heavy:
        return "graph"
    if prompt_tokens > context_budget * 0.10:
        return "lookup_tool"
    return "inject"


def make_ontology_executor(onto, base_execute):
    def execute(name, args):
        if name == "ontology_lookup":
            return lookup(onto, args["term"])
        return base_execute(name, args)
    return execute


if __name__ == "__main__":
    onto = load_ontology()
    print("검증:", validate(onto) or "문제 없음")
    text = render_for_prompt(onto)
    print(text)
    toks = len(text) // 2  # 한글은 대략 글자 2개 ≈ 1토큰 (거친 추정)
    print(f"\n~{toks} 토큰 → 전략: {decide_strategy(toks, 200_000)}")
    p = find_path(onto, resolve(onto, "대금지급"), resolve(onto, "검수"))
    print("대금지급 ↔ 검수 경로:", explain_path(onto, p))
