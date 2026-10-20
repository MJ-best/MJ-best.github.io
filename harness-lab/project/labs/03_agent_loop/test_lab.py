import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text, tool_use  # noqa: E402

lab = load_target(__file__)
quiet = lambda *a, **k: None  # noqa: E731


def fake_exec(name, args):
    return f"ran {name} {args.get('command', '')}"


class Lab3(unittest.TestCase):
    def run_script(self, script, **kw):
        brain = ScriptedBrain(script)
        msgs = [{"role": "user", "content": "작업해줘"}]
        out = lab.run_turn(brain, msgs, execute=fake_exec, log=quiet, **kw)
        return brain, msgs, out

    def test_plain_answer_one_call(self):
        brain, msgs, out = self.run_script([reply(text("그냥 답"))])
        self.assertEqual(out, "그냥 답")
        self.assertEqual(len(brain.requests), 1)
        self.assertEqual(len(msgs), 2)

    def test_multi_round(self):
        brain, msgs, out = self.run_script([
            reply(tool_use("run_command", {"command": "ls"}, id="t1")),
            reply(text("생각 중"), tool_use("run_command", {"command": "cat x"}, id="t2")),
            reply(text("끝!")),
        ])
        self.assertEqual(out, "끝!")
        self.assertEqual(len(brain.requests), 3)
        self.assertEqual([m["role"] for m in msgs],
                         ["user", "assistant", "user", "assistant", "user", "assistant"])
        self.assertEqual(msgs[2]["content"][0]["tool_use_id"], "t1")
        self.assertEqual(msgs[4]["content"][0]["content"], "ran run_command cat x")
        # 세 번째 요청엔 앞의 모든 왕복이 담겨 있어야 한다
        self.assertEqual(len(brain.requests[2]["messages"]), 5)
        self.assertIn("tools", brain.requests[0])

    def test_parallel_tools_one_user_message(self):
        brain, msgs, out = self.run_script([
            reply(tool_use("run_command", {"command": "a"}, id="p1"),
                  tool_use("run_command", {"command": "b"}, id="p2")),
            reply(text("ok")),
        ])
        results = msgs[2]["content"]
        self.assertEqual([r["tool_use_id"] for r in results], ["p1", "p2"],
                         "병렬 tool_use 결과는 '하나의' user 메시지에 모두 담아야 합니다")

    def test_max_rounds(self):
        forever = [reply(tool_use("run_command", {"command": "again"})) for _ in range(5)]
        brain, msgs, out = self.run_script(forever, max_rounds=3)
        self.assertEqual(len(brain.requests), 3)
        self.assertTrue(out.startswith("[harness]"))


if __name__ == "__main__":
    unittest.main()
