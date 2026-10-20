import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text, tool_use  # noqa: E402

lab = load_target(__file__)


class Lab5(unittest.TestCase):
    def test_fork_context(self):
        brain = ScriptedBrain([
            # 부모: 위임
            reply(tool_use("agent", {"task": "설정 파일 찾아줘"}, id="P1")),
            # 서브: 도구 하나 쓰고 보고
            reply(tool_use("run_command", {"command": "echo SECRET_DETAIL"}, id="S1")),
            reply(text("보고서: config.yaml 에 있음")),
            # 부모: 마무리
            reply(text("config.yaml 이네요")),
        ])
        msgs = [{"role": "user", "content": "설정 어딨어?"}]
        out = lab.run_turn(brain, msgs)
        self.assertEqual(out, "config.yaml 이네요")

        sub_first = brain.requests[1]
        self.assertEqual(sub_first["system"], lab.SUB_SYSTEM)
        self.assertEqual(sub_first["messages"], [{"role": "user", "content": "설정 파일 찾아줘"}],
                         "서브에이전트는 '새 배열'에서 시작해야 합니다")
        self.assertNotIn("agent", [t["name"] for t in sub_first["tools"]],
                         "서브에이전트에게 agent 도구를 주면 무한 위임이 가능해집니다")

        parent_result = msgs[2]["content"][0]
        self.assertEqual(parent_result["tool_use_id"], "P1")
        self.assertEqual(parent_result["content"], "보고서: config.yaml 에 있음")
        self.assertNotIn("SECRET_DETAIL", json.dumps(msgs, ensure_ascii=False),
                         "서브에이전트의 중간 과정이 부모 배열에 새면 안 됩니다")

    def test_executor_routes_other_tools(self):
        with mock.patch.object(lab, "execute_tool", return_value="BASE") as m:
            ex = lab.make_executor(ScriptedBrain([]))
            self.assertEqual(ex("read_file", {"path": "x"}), "BASE")
            m.assert_called_once()


if __name__ == "__main__":
    unittest.main()
