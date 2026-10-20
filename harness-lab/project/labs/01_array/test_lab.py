import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402
from common.brain import ScriptedBrain, reply, text  # noqa: E402

lab = load_target(__file__)


class Lab1(unittest.TestCase):
    def test_add_user_shape(self):
        m = lab.add_user([], "안녕")
        self.assertEqual(m, [{"role": "user", "content": "안녕"}])

    def test_add_assistant_keeps_all_blocks(self):
        r = reply(text("a"), text("b"))
        m = lab.add_assistant([], r)
        self.assertEqual(m[0]["role"], "assistant")
        self.assertEqual(m[0]["content"], r["content"], "content 블록 리스트를 통째로 넣어야 합니다")

    def test_text_of(self):
        self.assertEqual(lab.text_of(reply(text("가"), text("나"))), "가나")

    def test_every_call_resends_whole_history(self):
        brain = ScriptedBrain([reply(text("첫 답")), reply(text("둘째 답"))])
        messages = []
        self.assertEqual(lab.chat_once(brain, messages, "하나"), "첫 답")
        self.assertEqual(lab.chat_once(brain, messages, "둘"), "둘째 답")
        first, second = brain.requests
        self.assertEqual(len(first["messages"]), 1)
        self.assertEqual(len(second["messages"]), 3,
                         "두 번째 호출에는 [user, assistant, user] 전체가 가야 합니다")
        self.assertEqual(second["messages"][0]["content"], "하나")
        self.assertEqual(len(messages), 4)
        self.assertEqual([m["role"] for m in messages],
                         ["user", "assistant", "user", "assistant"])

    def test_session_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.json")
            self.assertEqual(lab.load_session(p), [], "없는 파일 = 새 대화 = []")
            msgs = [{"role": "user", "content": "한글 저장"}]
            lab.save_session(p, msgs)
            self.assertEqual(lab.load_session(p), msgs)


if __name__ == "__main__":
    unittest.main()
