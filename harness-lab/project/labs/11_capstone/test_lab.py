"""캡스톤 통합 테스트. LAB_TARGET=exercise 이면 내가 푼 exercise.py 들로 조립해서 검사."""
import json
import os
import sys
import tempfile
import unittest

os.environ.setdefault("LAB_IMPL", os.environ.get("LAB_TARGET", "solution"))
os.environ.pop("HARNESS_DEBUG", None)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
import mini_harness as mh  # noqa: E402
from common.brain import FakeBrain, ScriptedBrain, reply, text, tool_use  # noqa: E402

quiet = lambda *a: None  # noqa: E731


class Capstone(unittest.TestCase):
    def test_system_has_ontology_and_tools(self):
        h = mh.MiniHarness(ScriptedBrain([]), approve=lambda c: False)
        self.assertIn("<ontology", h.system)
        names = {t["name"] for t in h.tools}
        self.assertTrue({"read_file", "agent", "todo_write", "search_docs", "ontology_lookup"} <= names)

    def test_full_scenario(self):
        with tempfile.TemporaryDirectory() as d:
            env_path = os.path.join(d, ".env")
            brain = ScriptedBrain([
                reply(tool_use("todo_write", {"items": "규정 찾기\n답변"}, id="a")),
                reply(tool_use("search_docs", {"query": "어음 지급"}, id="b"),
                      tool_use("write_file", {"path": env_path, "content": "x"}, id="c")),
                reply(tool_use("agent", {"task": "삼자대사 뜻 조사"}, id="d")),
                reply(tool_use("ontology_lookup", {"term": "삼자대사"}, id="e")),   # 서브에이전트
                reply(text("삼자대사는 발주·입고·송장 대조")),                       # 서브 보고
                reply(text("어음 지급은 하지 않습니다.")),
            ])
            h = mh.MiniHarness(brain, approve=lambda c: False, memory_path=os.path.join(d, "none.md"))
            msgs = [{"role": "user", "content": "어음 돼?"}]
            out = h.run_turn(msgs, on_event=lambda *a: None)
            self.assertEqual(out, "어음 지급은 하지 않습니다.")
            dump = json.dumps(msgs, ensure_ascii=False)
            self.assertIn("06_대금지급_규정.md", dump)                 # RAG
            self.assertIn("BLOCKED", dump)                              # 가드레일
            self.assertFalse(os.path.exists(env_path))
            self.assertIn("현재 할 일", dump)                           # todo 리마인더
            self.assertIn("삼자대사는 발주·입고·송장 대조", dump)         # 서브에이전트 보고
            self.assertNotIn("[three_way_match]", dump)                 # 서브 중간과정은 안 샘
            last_req = brain.requests[-1]["messages"][-1]["content"][-1]
            self.assertIn("cache_control", last_req)                    # 캐시 브레이크포인트

    def test_runs_with_fake_brain(self):
        h = mh.MiniHarness(FakeBrain(), approve=lambda c: False)
        msgs = [{"role": "user", "content": "run echo hello"}]
        out = h.run_turn(msgs, on_event=lambda *a: None)
        self.assertIn("hello", out)


if __name__ == "__main__":
    unittest.main()
