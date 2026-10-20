import builtins
import copy
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target, ROOT  # noqa: E402
from common.brain import ScriptedBrain, reply, text, tool_use  # noqa: E402
from common.loop import run_loop  # noqa: E402

lab = load_target(__file__)


class Lab10(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.onto = lab.load_ontology()

    def test_json_fallback_matches_yaml(self):
        real_import = builtins.__import__

        def no_yaml(name, *a, **k):
            if name == "yaml":
                raise ImportError
            return real_import(name, *a, **k)
        with mock.patch.object(builtins, "__import__", no_yaml):
            from_json = lab.load_ontology()
        self.assertEqual(from_json, self.onto, "ontology.json 이 YAML 과 다릅니다 → scripts/yaml_to_json.py")

    def test_validate_clean(self):
        self.assertEqual(lab.validate(self.onto), [])

    def test_validate_catches_errors(self):
        bad = copy.deepcopy(self.onto)
        bad["concepts"]["payment"]["relations"].append({"type": "x", "target": "ghost"})
        bad["concepts"]["supplier"]["synonyms"].append("PO")        # 발주의 동의어와 충돌
        del bad["concepts"]["invoice"]["definition"]
        errs = lab.validate(bad)
        self.assertTrue(any("ghost" in e for e in errs))
        self.assertTrue(any("충돌" in e for e in errs))
        self.assertTrue(any(e.startswith("invoice") for e in errs))

    def test_resolve_org_terms(self):
        self.assertEqual(lab.resolve(self.onto, "삼자대사"), "three_way_match")
        self.assertEqual(lab.resolve(self.onto, "3자 대사"), "three_way_match")
        self.assertEqual(lab.resolve(self.onto, "3-way match"), "three_way_match")
        self.assertEqual(lab.resolve(self.onto, "po"), "purchase_order")
        self.assertEqual(lab.resolve(self.onto, "협력사"), "supplier")
        self.assertIsNone(lab.resolve(self.onto, "점심메뉴"))

    def test_render_has_everything(self):
        t = lab.render_for_prompt(self.onto)
        self.assertTrue(t.startswith("<ontology"))
        self.assertTrue(t.rstrip().endswith("</ontology>"))
        for c in self.onto["concepts"].values():
            self.assertIn(c["label"], t)
        self.assertIn("R1:", t)
        self.assertIn("requires → three_way_match(3-Way Match)", t)

    def test_lookup_incoming_and_rules(self):
        out = lab.lookup(self.onto, "QC검사")
        self.assertIn("[inspection] 검수", out)
        self.assertIn("goods_receipt(입고) -requires→", out, "들어오는 관계가 있어야 경로를 거슬러 갈 수 있습니다")
        self.assertIn("R3", lab.lookup(self.onto, "검수"))
        self.assertTrue(lab.lookup(self.onto, "점심").startswith("UNKNOWN"))

    def test_find_path_multi_hop(self):
        p = lab.find_path(self.onto, "payment", "inspection")
        self.assertEqual(p, [("payment", "requires", "three_way_match"),
                             ("three_way_match", "compares", "goods_receipt"),
                             ("goods_receipt", "requires", "inspection")])
        self.assertEqual(lab.find_path(self.onto, "payment", "payment"), [])
        self.assertIsNone(lab.find_path(self.onto, "payment", "inspection", max_depth=2))

    def test_strategy(self):
        self.assertEqual(lab.decide_strategy(2_000, 200_000), "inject")
        self.assertEqual(lab.decide_strategy(30_000, 200_000), "lookup_tool")
        self.assertEqual(lab.decide_strategy(2_000, 200_000, multi_hop_heavy=True), "graph")

    def test_injection_beats_rag_on_multi_hop(self):
        """같은 질문에 대해: RAG top-3 는 고리를 놓치지만, 전체 주입은 고리가 모두 프롬프트에 있다."""
        sys.path.insert(0, os.path.join(ROOT, "labs", "09_rag"))
        import solution as rag  # 정답 구현으로 비교
        idx = rag.Index(rag.load_docs())
        hits = " ".join(c["text"] for _, c in idx.search("대금지급 전에 검수가 끝나야 하나요?", 3))
        system = lab.build_system("너는 구매 도우미다.", self.onto)
        for link in ("3-Way Match", "입고", "검수", "대금지급"):
            self.assertIn(link, system)
        self.assertNotIn("입고(GR)를 등록", hits)

    def test_lookup_tool_in_loop(self):
        brain = ScriptedBrain([reply(tool_use("ontology_lookup", {"term": "마감"}, id="L")),
                               reply(text("모르는 용어라 규칙을 찾아볼게요"))])
        msgs = [{"role": "user", "content": "마감이 뭐야?"}]
        ex = lab.make_ontology_executor(self.onto, lambda n, a: "base")
        run_loop(brain, msgs, [lab.ONTOLOGY_TOOL], "sys", execute=ex)
        self.assertTrue(msgs[2]["content"][0]["content"].startswith("UNKNOWN"),
                        "'마감'은 개념이 아니라 '규칙'에 있다 → 1단계 전체 주입이 더 나은 사례")


if __name__ == "__main__":
    unittest.main()
