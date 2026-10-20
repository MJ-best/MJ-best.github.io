import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text, tool_use  # noqa: E402
from common.loop import run_loop  # noqa: E402

lab = load_target(__file__)


class Lab9(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = lab.Index(lab.load_docs())

    def test_chunking_packs_paragraphs(self):
        doc = "가" * 50 + "\n\n" + "나" * 50 + "\n\n" + "다" * 150
        cs = lab.chunk_text(doc, "d.md", max_chars=120)
        self.assertEqual([c["id"] for c in cs], ["d.md#0", "d.md#1"])
        self.assertEqual(cs[0]["text"], "가" * 50 + "\n\n" + "나" * 50)
        self.assertEqual(cs[1]["text"], "다" * 150, "긴 문단은 혼자 한 청크")
        self.assertEqual(cs[0]["source"], "d.md")

    def test_bm25_prefers_matching_chunk(self):
        hits = self.index.search("중복 송장 차단", k=2)
        self.assertEqual(hits[0][1]["source"], "05_대사_통제.md")
        self.assertGreaterEqual(hits[0][0], hits[1][0])

    def test_search_excludes_zero_scores(self):
        self.assertEqual(self.index.search("zzqqxx", k=3), [])

    def test_irrelevant_doc_not_retrieved(self):
        sources = [c["source"] for _, c in self.index.search("대금지급 규정", k=3)]
        self.assertNotIn("07_사내공지_식당.md", sources)

    def test_augment_format(self):
        msg = lab.augment(self.index, "지급은 어떻게 하나요?", k=2)
        self.assertTrue(msg.startswith("<retrieved>"))
        self.assertIn('<doc id="06_대금지급_규정.md#0">', msg)
        self.assertTrue(msg.rstrip().endswith("질문: 지급은 어떻게 하나요?"))

    def test_agentic_rag_tool(self):
        brain = ScriptedBrain([
            reply(tool_use("search_docs", {"query": "어음 지급"}, id="S")),
            reply(text("어음 지급은 하지 않습니다 [06_대금지급_규정.md#0]")),
        ])
        msgs = [{"role": "user", "content": "어음으로 줘도 돼?"}]
        ex = lab.make_search_executor(self.index, lambda n, a: "base")
        run_loop(brain, msgs, [lab.SEARCH_TOOL], "sys", execute=ex)
        self.assertIn("어음 지급은 하지 않습니다", msgs[2]["content"][0]["content"])

    def test_multi_hop_gap(self):
        """관찰용: '대금지급 ↔ 검수'를 잇는 고리(삼자대사·입고) 문서가 top-3 에 없다.
        RAG 의 구조적 한계 — Lab 10 에서 온톨로지로 메웁니다."""
        sources = {c["source"] for _, c in
                   self.index.search("대금지급 전에 검수가 끝나야 하나요?", k=3)}
        self.assertFalse({"05_대사_통제.md", "02_입고_처리.md"} <= sources)


if __name__ == "__main__":
    unittest.main()
