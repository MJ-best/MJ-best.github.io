import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.labkit import load_target  # noqa: E402

lab = load_target(__file__)


class Lab7(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_protected_path(self):
        g = lab.Guard(approve=lambda c: True)
        out = g.executor()("write_file", {"path": os.path.join(self.d, ".env"), "content": "x"})
        self.assertTrue(out.startswith("BLOCKED"))
        self.assertFalse(os.path.exists(os.path.join(self.d, ".env")))

    def test_new_file_ok(self):
        g = lab.Guard(approve=lambda c: True)
        p = os.path.join(self.d, "new.txt")
        self.assertIsNone(g.check("write_file", {"path": p, "content": "x"}))

    def test_read_before_write(self):
        p = os.path.join(self.d, "exists.txt")
        with open(p, "w") as f:
            f.write("old")
        g = lab.Guard(approve=lambda c: True)
        ex = g.executor()
        self.assertTrue(ex("write_file", {"path": p, "content": "new"}).startswith("BLOCKED"))
        self.assertEqual(open(p).read(), "old")
        ex("read_file", {"path": p})
        self.assertFalse(ex("write_file", {"path": p, "content": "new"}).startswith("BLOCKED"))
        self.assertEqual(open(p).read(), "new")

    def test_dangerous_needs_approval(self):
        asked = []
        g = lab.Guard(approve=lambda c: asked.append(c) or False)
        out = g.check("run_command", {"command": "rm -rf build"})
        self.assertTrue(out.startswith("BLOCKED"))
        self.assertEqual(asked, ["rm -rf build"])
        g2 = lab.Guard(approve=lambda c: True)
        self.assertIsNone(g2.check("run_command", {"command": "rm -rf build"}))

    def test_safe_command_not_asked(self):
        g = lab.Guard(approve=lambda c: self.fail("안전한 명령엔 묻지 않아야 합니다"))
        self.assertIsNone(g.check("run_command", {"command": "ls -la"}))


if __name__ == "__main__":
    unittest.main()
