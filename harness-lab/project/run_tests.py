#!/usr/bin/env python3
"""채점기.

  python run_tests.py            모든 랩의 exercise.py 채점
  python run_tests.py 3          Lab 3 만
  python run_tests.py 3 -v       자세히
  python run_tests.py --solution 정답(solution.py)으로 채점 + 모든 예제 실행 (설치 확인용)
  python run_tests.py --examples 따라 해보기 예제(examples.py)만 실행
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


def check_examples(nums):
    sys.path.insert(0, ROOT)
    from common.examples import parse, run_cell
    bad = 0
    for f in sorted(glob.glob(os.path.join(ROOT, "labs", "*", "examples.py"))):
        lab = os.path.dirname(f)
        if nums and int(os.path.basename(lab)[:2]) not in map(int, nums):
            continue
        cells = parse(f)
        fails = [i + 1 for i, c in enumerate(cells) if run_cell(lab, c["code"])[0] != 0]
        bad += len(fails)
        print(f"{'✅' if not fails else '❌'}  {os.path.basename(lab)} 예제 {len(cells)}개"
              + (f" — 실패: {fails}" if fails else ""))
    return bad == 0


def main():
    args = sys.argv[1:]
    if "--examples" in args:
        sys.exit(0 if check_examples([a for a in args if a.isdigit()]) else 1)
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
    ex_ok = True
    if target == "solution":
        print("\n따라 해보기 예제 실행 확인")
        ex_ok = check_examples(nums)
    sys.exit(0 if passed == len(labs) and ex_ok else 1)


if __name__ == "__main__":
    main()
