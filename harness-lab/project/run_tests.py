#!/usr/bin/env python3
"""채점기.

  python run_tests.py            모든 랩의 exercise.py 채점
  python run_tests.py 3          Lab 3 만
  python run_tests.py 3 -v       자세히
  python run_tests.py --solution 정답(solution.py)으로 채점 (설치 확인용)
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    args = sys.argv[1:]
    target = "solution" if "--solution" in args else "exercise"
    verbose = "-v" in args
    nums = [a for a in args if a.isdigit()]
    labs = sorted(d for d in glob.glob(os.path.join(ROOT, "labs", "[0-9][0-9]_*"))
                  if os.path.exists(os.path.join(d, "test_lab.py")))
    if nums:
        labs = [d for d in labs if int(os.path.basename(d)[:2]) in map(int, nums)]
    env = dict(os.environ, LAB_TARGET=target, HARNESS_BRAIN="fake")
    passed = 0
    for d in labs:
        cmd = [sys.executable, "-m", "unittest", "test_lab"] + (["-v"] if verbose else [])
        r = subprocess.run(cmd, cwd=d, env=env, capture_output=True, text=True)
        ok = r.returncode == 0
        passed += ok
        print(f"{'✅' if ok else '❌'}  {os.path.basename(d)}")
        if verbose or not ok:
            tail = r.stderr.strip().splitlines()
            print("    " + "\n    ".join(tail[-25:] if not verbose else tail))
    print(f"\n{passed}/{len(labs)} 랩 통과 ({target}.py)")
    sys.exit(0 if passed == len(labs) else 1)


if __name__ == "__main__":
    main()
