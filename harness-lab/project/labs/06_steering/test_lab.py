import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text, tool_use  # noqa: E402
from common.loop import run_loop  # noqa: E402

lab = load_target(__file__)


class Lab6(unittest.TestCase):
    def test_todo_parse(self):
        s = lab.Steering()
        msg = s.todo_write("x 첫째\n\n둘째\nx 셋째")
        self.assertEqual(s.todos, [(True, "첫째"), (False, "둘째"), (True, "셋째")])
        self.assertIsInstance(msg, str)

    def test_inject_drains_queue_once(self):
        s = lab.Steering()
        s.remind("A")
        s.steer("B")
        blocks = []
        s.inject(blocks)
        self.assertEqual(len(blocks), 1)
        self.assertIn("<system-reminder>", blocks[0]["text"])
        self.assertIn("A", blocks[0]["text"])
        self.assertIn("B", blocks[0]["text"])
        again = []
        s.inject(again)
        self.assertEqual(again, [], "한 번 전달한 리마인더는 큐에서 사라져야 합니다")

    def test_todos_reshown_until_done(self):
        s = lab.Steering()
        s.todo_write("일1")
        b = []
        s.inject(b)
        self.assertEqual(len(b), 1)
        self.assertIn("[ ] 일1", b[0]["text"])
        s.todo_write("x 일1")
        b = []
        s.inject(b)
        self.assertEqual(b, [], "모두 끝나면 다시 보여줄 필요 없음")

    def test_in_loop(self):
        s = lab.Steering()
        brain = ScriptedBrain([
            reply(tool_use("todo_write", {"items": "조사\n수정"}, id="T")),
            reply(tool_use("run_command", {"command": "x"}, id="R")),
            reply(text("완료")),
        ])
        msgs = [{"role": "user", "content": "go"}]

        def base(name, args):
            s.steer("천천히 해")      # 도구 실행 중 사용자가 끼어듦
            return "ok"
        run_loop(brain, msgs, [lab.TODO_TOOL], "sys", execute=s.executor(base), inject=s.inject)
        second_user = msgs[4]["content"]
        self.assertEqual(second_user[0]["type"], "tool_result",
                         "tool_result 가 먼저, 리마인더는 그 뒤에 와야 합니다")
        joined = "".join(b.get("text", "") for b in second_user)
        self.assertIn("천천히 해", joined)
        self.assertIn("조사", joined)


if __name__ == "__main__":
    unittest.main()
