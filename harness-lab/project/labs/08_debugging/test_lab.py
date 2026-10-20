import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text  # noqa: E402

lab = load_target(__file__)
ELIDED = "[이전 도구 결과 생략됨]"


def tr(i, c):
    return {"type": "tool_result", "tool_use_id": f"t{i}", "content": c}


class Lab8(unittest.TestCase):
    def test_capture(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "cap.jsonl")
            b = lab.CapturingBrain(ScriptedBrain([reply(text("a")), reply(text("b"))]), p)
            r1 = b({"messages": [{"role": "user", "content": "1"}]})
            b({"messages": [{"role": "user", "content": "2"}]})
            self.assertEqual(r1["content"][0]["text"], "a")
            lines = [json.loads(x) for x in open(p, encoding="utf-8")]
            self.assertEqual(len(lines), 2)
            self.assertEqual(lines[1]["request"]["messages"][0]["content"], "2")
            self.assertEqual(lines[0]["response"]["content"][0]["text"], "a")

    def test_cache_ratio(self):
        self.assertEqual(lab.cache_hit_ratio({}), 0.0)
        self.assertAlmostEqual(lab.cache_hit_ratio(
            {"input_tokens": 10, "cache_read_input_tokens": 80,
             "cache_creation_input_tokens": 10}), 0.8)

    def test_append_only_is_cache_friendly(self):
        prev = [{"role": "user", "content": "go"},
                {"role": "user", "content": [tr(1, "big")]}]
        curr = prev + [{"role": "user", "content": [tr(2, "more")]}]
        self.assertIsNone(lab.first_divergence(prev, curr))

    def test_cache_control_ignored(self):
        prev = [{"role": "user", "content": [{"type": "text", "text": "hi",
                                              "cache_control": {"type": "ephemeral"}}]}]
        curr = [{"role": "user", "content": [{"type": "text", "text": "hi"}]},
                {"role": "assistant", "content": "x"}]
        self.assertIsNone(lab.first_divergence(prev, curr))

    def test_eliding_breaks_prefix(self):
        """Lab 4의 elide 를 쓰면 공간은 생기지만 캐시가 깨진다는 걸 눈으로 확인."""
        prev = [{"role": "user", "content": "go"},
                {"role": "user", "content": [tr(1, "big")]},
                {"role": "user", "content": [tr(2, "big2")]}]
        curr = [{"role": "user", "content": "go"},
                {"role": "user", "content": [tr(1, ELIDED)]},
                {"role": "user", "content": [tr(2, "big2")]},
                {"role": "user", "content": [tr(3, "new")]}]
        self.assertEqual(lab.first_divergence(prev, curr), 1)


if __name__ == "__main__":
    unittest.main()
