#!/usr/bin/env python3
"""후보 하나를 분석해 projects.json 에 추가한다.

사용: python3 add_project.py '<discover.py 가 낸 후보 JSON 한 개>'
필요: claude CLI (CLAUDE_CODE_OAUTH_TOKEN), git, node + playwright, Pillow
"""
import json, os, re, subprocess, sys, tempfile
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
ROOT = SRC.parent
SYNC = SRC / "sync"
OWNER = "MJ-best"
GH = f"https://github.com/{OWNER}/"
P = json.loads((SRC / "projects.json").read_text("utf-8"))
SITE = json.loads((SRC / "site.json").read_text("utf-8"))
REQUIRED = ["id", "title", "cat", "platform", "summary", "problem", "features", "stack", "flow", "hard_part", "numbers", "arch"]


def run(cmd, **kw):
    print("+", " ".join(cmd) if isinstance(cmd, list) else cmd, flush=True)
    return subprocess.run(cmd, check=True, **kw)


def checkout(c, workdir):
    if c["kind"] == "pages_dir":
        return ROOT / c["name"]
    token = os.environ.get("PORTFOLIO_READ_TOKEN", "")
    url = f"https://x-access-token:{token}@github.com/{OWNER}/{c['name']}.git" if token else f"{GH}{c['name']}.git"
    dest = Path(workdir) / c["name"]
    run(["git", "clone", "--depth", "1", "-q", url, str(dest)])
    return dest


def demo_url(c):
    if c["kind"] == "pages_dir":
        return f"https://mj-best.github.io/{c['name']}/"
    if c.get("homepage", "").startswith("http"):
        return c["homepage"]
    if c.get("has_pages") and not c.get("private"):
        return f"https://mj-best.github.io/{c['name']}/"
    return ""


def ask_claude(c, repo_dir, demo):
    private = c.get("private", False)
    snippet_rule = (
        '- Do NOT include a "snippet" key (private repository).'
        if private else
        '- "snippet": {"file": path, "lang": "js"|"python"|"typescript"|"kotlin"|"swift"|..., "caption": one sentence, '
        '"code": a REAL excerpt copied VERBATIM from that file, 8–18 lines, the most interesting core logic}'
    )
    privacy_rule = (
        "PRIVACY: this is a PRIVATE repository shown on a PUBLIC page. Never include code excerpts, secrets, tokens, "
        "env values, account numbers, emails, internal URLs, personal data, financial amounts or holdings, or health data."
        if private else
        "Never include secrets, tokens, env values or personal data."
    )
    prompt = (SYNC / "prompt.md").read_text("utf-8")
    for k, v in {
        "{{NAME}}": c["name"], "{{VISIBILITY}}": "private" if private else "public",
        "{{DESCRIPTION}}": c.get("description", ""), "{{DEMO}}": demo,
        "{{CATEGORIES}}": ", ".join(SITE["categories"]),
        "{{PATTERNS}}": ", ".join(pt["key"] for pt in SITE["stack"]["patterns"]),
        "{{SNIPPET_RULE}}": snippet_rule, "{{PRIVACY_RULE}}": privacy_rule,
    }.items():
        prompt = prompt.replace(k, v)
    out = repo_dir / ".portfolio_entry.json"
    if out.exists():
        out.unlink()
    run(["claude", "-p", prompt, "--permission-mode", "acceptEdits",
         "--allowedTools", "Read,Glob,Grep,Write,Bash(python3 -c:*),Bash(ls:*),Bash(wc:*)",
         "--max-turns", "60"], cwd=repo_dir, timeout=1500)
    entry = json.loads(out.read_text("utf-8"))
    out.unlink()
    return entry


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def validate(entry, c, repo_dir):
    missing = [k for k in REQUIRED if not entry.get(k)]
    if missing:
        raise SystemExit(f"entry missing keys: {missing}")
    if entry["cat"] not in SITE["categories"]:
        entry["cat"] = next(iter(SITE["categories"]))
    if c.get("private"):
        entry.pop("snippet", None)
        return
    sn = entry.get("snippet") or {}
    f = repo_dir / sn.get("file", "")
    if not f.is_file():
        raise SystemExit(f"snippet file not found: {sn.get('file')}")
    body = norm(f.read_text("utf-8", errors="ignore"))
    lines = [norm(l) for l in sn.get("code", "").splitlines() if norm(l) and not norm(l).startswith(("// …", "# …", "//…", "#…", "…"))]
    hits = sum(1 for l in lines if l in body)
    if not lines or hits / len(lines) < 0.8:
        raise SystemExit(f"snippet is not a verbatim excerpt ({hits}/{len(lines)} lines matched)")


def screenshot(c, demo, ident):
    """데모를 찍어 img/<id>.webp, img/<id>-t.webp 저장. 성공하면 이미지 이름을 돌려준다."""
    if not demo:
        return None
    png = Path(tempfile.mkdtemp()) / "shot.png"
    url = demo
    server = None
    if c["kind"] == "pages_dir":  # 아직 배포 전일 수 있어 체크아웃을 직접 띄운다
        server = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        url = f"http://localhost:8765/{c['name']}/"
    try:
        run(["node", str(SYNC / "shot.mjs"), url, str(png)], timeout=120)
    except Exception as ex:
        print("screenshot failed:", ex)
        return None
    finally:
        if server:
            server.terminate()
    from PIL import Image
    im = Image.open(png).convert("RGB")
    im.save(SRC / "img" / f"{ident}.webp", "WEBP", quality=80, method=6)
    t = im.crop((0, 0, im.width, min(im.height, int(im.width * 0.625))))
    t.thumbnail((720, 450))
    t.save(SRC / "img" / f"{ident}-t.webp", "WEBP", quality=78, method=6)
    return ident


def main():
    c = json.loads(sys.argv[1])
    with tempfile.TemporaryDirectory() as wd:
        repo_dir = checkout(c, wd)
        demo = demo_url(c)
        entry = ask_claude(c, repo_dir, demo)
        validate(entry, c, repo_dir)

    ids = {p["id"] for p in P}
    base = re.sub(r"[^a-z0-9-]+", "-", entry["id"].lower()).strip("-") or c["name"].lower()
    ident = base
    while ident in ids:
        ident += "-2"
    entry["id"] = entry["slug"] = ident
    entry["year"] = entry.get("year") or "2026"
    entry["source"] = {"pages_dir": c["name"]} if c["kind"] == "pages_dir" else {"repo": c["name"]}
    entry["private"] = bool(c.get("private"))
    if c["kind"] == "pages_dir":
        entry["repo_base"] = f"{GH}MJ-best.github.io/blob/main/{c['name']}/"
        entry["links"] = [{"label": "데모 열기", "url": f"/{c['name']}/"},
                          {"label": "코드", "url": f"{GH}MJ-best.github.io/tree/main/{c['name']}"}]
    elif entry["private"]:
        entry["repo_base"] = ""
        entry["links"] = [{"label": "데모 열기", "url": demo}] if demo else []
    else:
        entry["repo_base"] = f"{GH}{c['name']}/blob/{c.get('default_branch', 'main')}/"
        entry["links"] = ([{"label": "데모 열기", "url": demo}] if demo else []) + [{"label": "GitHub", "url": GH + c["name"]}]

    shot = screenshot(c, demo, ident)
    if shot:
        entry["shots"] = [{"img": shot, "caption": f"{entry['title']} 첫 화면."}]
    else:
        entry["shots"] = []
        entry["cover"] = "arch"
    entry["auto_added"] = True

    P.append(entry)
    (SRC / "projects.json").write_text(json.dumps(P, ensure_ascii=False, indent=1), "utf-8")
    print(f"added {ident} ({entry['title']})")
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as fh:
        fh.write(f"- **{entry['title']}** (`{ident}`) — {entry['summary']}\n")


if __name__ == "__main__":
    main()
