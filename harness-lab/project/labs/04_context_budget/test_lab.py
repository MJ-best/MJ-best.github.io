import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402

lab = load_target(__file__)


def tr(i, content="결과"):
    return {"type": "tool_result", "tool_use_id": f"t{i}", "content": content}


class Lab4(unittest.TestCase):
    def test_truncate_short_untouched(self):
        self.assertEqual(lab.truncate("abc", 10), "abc")

    def test_truncate_long(self):
        s = "A" * 50 + "B" * 50
        out = lab.truncate(s, 20)
        self.assertTrue(out.startswith("A" * 10))
        self.assertTrue(out.endswith("B" * 10))
        self.assertIn("[80 chars truncated]", out)

    def test_cache_breakpoint_on_last_block(self):
        req = {"system": "s", "messages": [
            {"role": "user", "content": "첫 질문"},
            {"role": "assistant", "content": [{"type": "text", "text": "답"}]},
            {"role": "user", "content": [tr(1), tr(2)]}]}
        before = copy.deepcopy(req)
        out = lab.with_cache_breakpoint(req)
        self.assertEqual(out["messages"][-1]["content"][-1]["cache_control"], {"type": "ephemeral"})
        self.assertNotIn("cache_control", out["messages"][-1]["content"][0])
        self.assertEqual(req, before, "원본 요청을 바꾸면 안 됩니다 (append-only!)")

    def test_cache_breakpoint_string_content(self):
        out = lab.with_cache_breakpoint({"messages": [{"role": "user", "content": "hi"}]})
        blk = out["messages"][0]["content"][0]
        self.assertEqual(blk["text"], "hi")
        self.assertIn("cache_control", blk)

    def test_elide_keeps_recent(self):
        msgs = [{"role": "user", "content": "go"},
                {"role": "user", "content": [tr(1, "old1")]},
                {"role": "user", "content": [tr(2, "old2"), tr(3, "new3")]},
                {"role": "user", "content": [tr(4, "new4")]}]
        before = copy.deepcopy(msgs)
        out = lab.elide_old_tool_results(msgs, keep_last=2)
        flat = [b["content"] for m in out if isinstance(m["content"], list) for b in m["content"]]
        self.assertEqual(flat, [lab.ELIDED, lab.ELIDED, "new3", "new4"])
        self.assertEqual(msgs, before, "새 배열을 돌려줘야 합니다")


if __name__ == "__main__":
    unittest.main()
