"""테스트가 채점 대상(exercise.py 또는 solution.py)을 불러오는 도우미."""
import importlib.util
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def load_lab(dirname, impl="solution"):
    """다른 랩의 모듈을 불러온다.  rag = load_lab("09_rag")"""
    path = os.path.join(ROOT, "labs", dirname, f"{impl}.py")
    mod_name = f"lab_{dirname}_{impl}"
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


def load_target(test_file):
    """LAB_TARGET 환경변수(기본 exercise)에 해당하는 파일을 모듈로 불러온다."""
    lab_dir = os.path.dirname(os.path.abspath(test_file))
    name = os.environ.get("LAB_TARGET", "exercise")
    path = os.path.join(lab_dir, f"{name}.py")
    mod_name = f"{os.path.basename(lab_dir)}_{name}".replace("-", "_")
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod
