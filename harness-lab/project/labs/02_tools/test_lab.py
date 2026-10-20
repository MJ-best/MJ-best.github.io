import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text, tool_use  # noqa: E402

lab = load_target(__file__)


class Lab2(unittest.TestCase):
    def test_write_file_schema(self):
        tools = {t["name"]: t for t in lab.TOOLS}
        self.assertIn("write_file", tools)
        s = tools["write_file"]["input_schema"]
        self.assertEqual(s["type"], "object")
        self.assertEqual(set(s["required"]), {"path", "content"})
        self.assertTrue(tools["write_file"]["description"])

    def test_dispatch_read_write(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.txt")
            out = lab.execute_tool("write_file", {"path": p, "content": "hi"})
            self.assertIsInstance(out, str)
            self.assertEqual(lab.execute_tool("read_file", {"path": p}), "hi")

    def test_unknown_tool_is_string(self):
        self.assertEqual(lab.execute_tool("fly", {}), "ERROR: unknown tool fly")

    def test_exceptions_become_strings(self):
        out = lab.execute_tool("read_file", {"path": "/no/such/file"})
        self.assertTrue(out.startswith("ERROR"), "예외를 던지지 말고 문자열로 돌려줘야 합니다")
        out = lab.execute_tool("read_file", {"wrong_arg": 1})
        self.assertTrue(out.startswith("ERROR"))

    def test_results_match_ids(self):
        r = reply(tool_use("run_command", {"command": "echo 1"}, id="A"),
                  tool_use("run_command", {"command": "echo 2"}, id="B"))
        res = lab.tool_results_for(r)
        self.assertEqual([x["tool_use_id"] for x in res], ["A", "B"])
        self.assertEqual([x["type"] for x in res], ["tool_result"] * 2)
        self.assertEqual(res[1]["content"].strip(), "2")

    def test_one_tool_round(self):
        brain = ScriptedBrain([reply(tool_use("run_command", {"command": "echo hi"}, id="X")),
                               reply(text("결과는 hi"))])
        msgs = []
        self.assertEqual(lab.ask_with_tools(brain, msgs, "hi 출력해"), "결과는 hi")
        self.assertEqual([m["role"] for m in msgs], ["user", "assistant", "user", "assistant"])
        self.assertEqual(msgs[2]["content"][0]["tool_use_id"], "X")


if __name__ == "__main__":
    unittest.main()
