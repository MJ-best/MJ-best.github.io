#!/usr/bin/env python3
"""포트폴리오에 아직 없는 리포 / Pages 폴더를 찾는다.

규칙
- 공개 리포: 자동 후보 (토픽 no-portfolio 가 붙어 있으면 제외)
- 비공개 리포: 토픽 portfolio 가 붙은 것만 후보
- 포크·보관(archived) 리포, site.json 의 ignore 목록은 제외
- MJ-best.github.io 안의 새 폴더(index.html 이 있는 것)도 후보

출력: JSON 배열을 stdout 에 쓴다.
  [{"kind": "repo", "name": "...", "private": false, "homepage": "...", "has_pages": true, "description": "..."},
   {"kind": "pages_dir", "name": "..."}]
환경변수: PORTFOLIO_READ_TOKEN (없으면 공개 리포만 조회), ONLY (특정 이름만), LIMIT (기본 3)
"""
import json, os, sys, urllib.request
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
ROOT = SRC.parent
OWNER = "MJ-best"
P = json.loads((SRC / "projects.json").read_text("utf-8"))
SITE = json.loads((SRC / "site.json").read_text("utf-8"))


def api(url, token):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "portfolio-sync"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def list_repos(token):
    repos, page = [], 1
    while True:
        if token:
            url = f"https://api.github.com/user/repos?affiliation=owner&per_page=100&page={page}"
        else:
            url = f"https://api.github.com/users/{OWNER}/repos?per_page=100&page={page}"
        batch = api(url, token)
        repos += batch
        if len(batch) < 100:
            return repos
        page += 1


def main():
    token = os.environ.get("PORTFOLIO_READ_TOKEN") or os.environ.get("GITHUB_TOKEN")
    only = os.environ.get("ONLY", "").strip().lower()
    limit = int(os.environ.get("LIMIT", "3"))

    known_repos = {p["source"]["repo"].lower() for p in P if "repo" in p.get("source", {})}
    known_repos |= {o["repo"].lower() for o in SITE.get("others", []) if o.get("repo")}
    known_repos |= {r.lower() for r in SITE.get("ignore", {}).get("repos", [])}
    known_dirs = {p["source"]["pages_dir"] for p in P if "pages_dir" in p.get("source", {})}
    known_dirs |= set(SITE.get("ignore", {}).get("pages_dirs", []))

    out = []
    for r in list_repos(token):
        name = r["name"]
        if r.get("owner", {}).get("login", OWNER).lower() != OWNER.lower():
            continue
        if r.get("fork") or r.get("archived") or name.lower() in known_repos:
            continue
        topics = set(r.get("topics") or [])
        if "no-portfolio" in topics:
            continue
        if r.get("private") and "portfolio" not in topics:
            continue
        out.append({"kind": "repo", "name": name, "private": bool(r.get("private")),
                    "homepage": r.get("homepage") or "", "has_pages": bool(r.get("has_pages")),
                    "description": r.get("description") or "", "default_branch": r.get("default_branch") or "main"})

    for d in sorted(ROOT.iterdir()):
        if d.is_dir() and not d.name.startswith(".") and d.name not in known_dirs and (d / "index.html").exists():
            out.append({"kind": "pages_dir", "name": d.name, "private": False})

    if only:
        out = [c for c in out if c["name"].lower() == only]
    json.dump(out[:limit], sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
