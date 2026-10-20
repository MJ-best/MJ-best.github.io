#!/usr/bin/env python3
"""워크북 정적 사이트 빌더 → site/

  python scripts/build_site.py            # site/ 생성
  python scripts/build_site.py --zip      # site/harness-lab.zip 도 함께

결과물은 어떤 정적 호스팅(GitHub Pages 등)에 그대로 올리면 됩니다.
브라우저 채점은 Pyodide(CDN)로 동작하며, 실습 파일 전체를 assets/files.json 으로 묶습니다.
"""
import glob
import html
import json
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "site")
WB = os.path.join(ROOT, "workbook")
REPO_URL = os.environ.get("HARNESS_REPO_URL",
                          "https://github.com/MJ-best/MJ-best.github.io/tree/main/harness-lab/project")
PYODIDE = "https://cdn.jsdelivr.net/npm/pyodide@0.29.5/"


# ------------------------------------------------------------------ markdown
def inline(s):
    s = html.escape(s, quote=False)
    codes = []

    def keep(m):
        codes.append(f"<code>{m.group(1)}</code>")
        return f"\x00{len(codes) - 1}\x00"
    s = re.sub(r"`([^`]+)`", keep, s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])", r"<em>\1</em>", s)

    def link(m):
        text, url = m.group(1), m.group(2)
        ext = url.startswith("http")
        return (f'<a href="{url}"' + (' target="_blank" rel="noopener"' if ext else "")
                + f">{text}</a>")
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], s)


def markdown(md, skip_h1=True):
    lines, out, i = md.splitlines(), [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            lang = line[3:].strip() or "plaintext"
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            cls = "plaintext" if lang == "text" else lang
            out.append(f'<pre class="code"><code class="language-{cls}">'
                       f"{html.escape(chr(10).join(buf))}</code></pre>")
            continue
        m = re.match(r"^(#{1,4})\s+(.*)", line)
        if m:
            lvl = len(m.group(1))
            if not (lvl == 1 and skip_h1):
                out.append(f"<h{lvl + 1}>{inline(m.group(2))}</h{lvl + 1}>")
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head, body = rows[0], rows[1:]
            t = "<div class=\"table\"><table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head)
            t += "</tr></thead><tbody>" + "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body)
            out.append(t + "</tbody></table></div>")
            continue
        if re.match(r"^\s*([-*]|\d+\.)\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.", line))
            items = []
            while i < len(lines) and re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                items.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", lines[i]))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        if line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip("> "))
                i += 1
            out.append(f"<blockquote>{inline(' '.join(buf))}</blockquote>")
            continue
        if line.strip() == "---":
            out.append("<hr>")
            i += 1
            continue
        if not line.strip():
            i += 1
            continue
        buf = []
        while (i < len(lines) and lines[i].strip() and not re.match(r"^(#|```|\||>|\s*([-*]|\d+\.)\s)", lines[i])):
            buf.append(lines[i])
            i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")
    return "\n".join(out)


# --------------------------------------------------------------------- pages
def page(title, body, depth=0, desc="", extra_head=""):
    up = "../" * depth
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16181c" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="{up}manifest.webmanifest">
<link rel="icon" href="{up}assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{up}assets/style.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
{extra_head}
</head>
<body data-root="{up}">
{body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="{up}assets/app.js"></script>
</body>
</html>
"""


def topbar(depth, label="", lab_id=""):
    up = "../" * depth
    return f"""<header class="topbar">
  <a class="brand" href="{up}index.html"><span class="logo">⟲</span> 하네스 워크북</a>
  <span class="crumb">{html.escape(label)}</span>
  <span class="progress-pill" data-progress-pill title="완료한 랩">0/11</span>
</header>"""


def lab_title(readme):
    m = re.match(r"#\s+Lab\s+\d+\s+—\s+(.*)", readme.splitlines()[0])
    return m.group(1).strip() if m else readme.splitlines()[0].lstrip("# ")


def build():
    content = json.load(open(os.path.join(WB, "content.json"), encoding="utf-8"))
    lab_dirs = sorted(d for d in glob.glob(os.path.join(ROOT, "labs", "[0-9][0-9]_*")))
    labs = []
    for d in lab_dirs:
        lid = os.path.basename(d)
        readme = open(os.path.join(d, "README.md"), encoding="utf-8").read()
        labs.append({"id": lid, "n": int(lid[:2]), "title": lab_title(readme),
                     "readme": readme, "dir": d, **content["labs"][lid]})

    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "labs"))
    shutil.copytree(os.path.join(WB, "assets"), os.path.join(OUT, "assets"))

    # ---- 파일 번들 (브라우저 채점용)
    bundle = {}
    patterns = ["common/*.py", "data/procurement/**/*", "labs/*/*.py"]
    for pat in patterns:
        for p in glob.glob(os.path.join(ROOT, pat), recursive=True):
            if os.path.isfile(p) and "__pycache__" not in p:
                bundle[os.path.relpath(p, ROOT)] = open(p, encoding="utf-8").read()
    with open(os.path.join(OUT, "assets", "files.json"), "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False)

    meta = [{"id": l["id"], "n": l["n"], "title": l["title"], "short": l["short"],
             "minutes": l["minutes"]} for l in labs]

    # ---- 표지
    cards = []
    parts = [("Part I · 몸의 기본", range(1, 4)), ("Part II · 오래 달리기", range(4, 7)),
             ("Part III · 믿을 수 있는 몸", range(7, 9)), ("Part IV · 데이터 입히기", range(9, 11)),
             ("마무리", range(11, 12))]
    for name, rng in parts:
        cards.append(f'<h2 class="part">{name}</h2><ol class="labs">')
        for l in labs:
            if l["n"] in rng:
                cards.append(f"""<li><a class="labcard" href="labs/{l['id']}.html" data-lab="{l['id']}">
  <span class="num">{l['n']:02d}</span>
  <span class="body"><strong>{html.escape(l['title'])}</strong>
  <small>{html.escape(l['points'][0])}</small></span>
  <span class="meta"><span class="mins">{l['minutes']}분</span><span class="state" data-state></span></span>
</a></li>""")
        cards.append("</ol>")
    root_readme = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
    big = re.search(r"## 큰 그림(.*?)\n---", root_readme, re.S).group(1)
    index_body = f"""{topbar(0)}
<main class="wrap">
  <section class="hero">
    <p class="eyebrow">Harness Engineering · 실습 워크북</p>
    <h1>LLM은 두뇌,<br>하네스는 몸.</h1>
    <p class="lede">{html.escape(content['subtitle'])} 각 랩은 <b>개념 → 확인 퀴즈 → 브라우저에서 코드 채우기 → 자동 채점</b> 순서로 진행됩니다. 휴대폰에서도 됩니다.</p>
    <div class="cta">
      <a class="btn primary" data-continue href="labs/01_array.html">시작하기</a>
      <a class="btn" href="harness-lab.zip" download>전체 코드 내려받기</a>
    </div>
    <div class="bar"><span data-progress-bar></span></div>
    <p class="muted small" data-progress-text>진행 상황은 이 기기 브라우저에 저장됩니다.</p>
  </section>
  {''.join(cards)}
  <section class="card">
    <h2>큰 그림</h2>
    {markdown(big)}
  </section>
  <section class="card">
    <h2>공부하는 법</h2>
    <ol>
      <li><b>개념</b>을 읽고 <b>확인 퀴즈</b>를 풉니다.</li>
      <li><b>실습</b> 편집기에서 <code>TODO</code> 를 채웁니다. <kbd>TODO 찾기</kbd> 버튼이 다음 빈칸으로 데려갑니다.</li>
      <li><b>▶ 채점</b>을 누르면 브라우저 안의 파이썬(Pyodide)이 테스트를 돌립니다. 처음 한 번은 10MB 정도를 내려받습니다.</li>
      <li>막히면 <b>정답 보기</b>로 비교하세요. 작성한 코드는 자동 저장됩니다.</li>
      <li>PC에서는 <a href="harness-lab.zip">zip</a>을 받아 <code>python run_tests.py</code> 로 같은 테스트를 돌리고, <code>ANTHROPIC_API_KEY</code> 를 넣으면 진짜 Claude와 대화합니다.</li>
    </ol>
  </section>
  <section class="card small">
    <h2>출처</h2>
    <p>개념과 흐름: <a href="https://github.com/IsuruMaduranga/harness-engineering-101" target="_blank" rel="noopener">Harness Engineering 101</a> © Isuru Wijesiri (본문 CC BY-NC-ND 4.0, 코드 MIT). 이 워크북은 원문을 옮기지 않고 한국어로 새로 쓴 학습 자료입니다.<br>
    온톨로지 확장 순서: 장한별, <a href="https://bigstargithub.github.io/posts/AI-12/" target="_blank" rel="noopener">「그래서 Agent에 데이터를 어떻게 입히나요?」</a></p>
    <p><a href="{REPO_URL}" target="_blank" rel="noopener">GitHub에서 코드 보기</a></p>
  </section>
</main>
<script type="application/json" id="labs-meta">{json.dumps(meta, ensure_ascii=False)}</script>"""
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(
        page(content["title"], index_body, 0, content["subtitle"]))

    # ---- 랩 페이지
    for k, l in enumerate(labs):
        d = l["dir"]
        has_ex = os.path.exists(os.path.join(d, "exercise.py"))
        sol_name = "solution.py" if has_ex else "mini_harness.py"
        solution = open(os.path.join(d, sol_name), encoding="utf-8").read()
        exercise = open(os.path.join(d, "exercise.py"), encoding="utf-8").read() if has_ex else ""
        tests = open(os.path.join(d, "test_lab.py"), encoding="utf-8").read()
        prev_l = labs[k - 1] if k else None
        next_l = labs[k + 1] if k + 1 < len(labs) else None

        quiz_html = []
        for qi, q in enumerate(l["quiz"]):
            opts = "".join(f'<button class="opt" data-i="{oi}">{html.escape(o)}</button>'
                           for oi, o in enumerate(q["options"]))
            quiz_html.append(f"""<div class="quiz" data-answer="{q['answer']}" data-q="{qi}">
  <p class="q"><span class="qn">Q{qi + 1}</span> {html.escape(q['q'])}</p>
  <div class="opts">{opts}</div>
  <p class="why" hidden>{html.escape(q['why'])}</p>
</div>""")

        if has_ex:
            practice = f"""<section class="card practice" id="practice">
  <h2><span class="step">3</span> 실습: <code>exercise.py</code> 채우기</h2>
  <p class="muted small">TODO 표시 부분을 채우고 채점하세요. 입력 내용은 이 기기에 자동 저장됩니다.</p>
  <div class="toolbar">
    <button class="btn small" data-act="todo">TODO 찾기</button>
    <button class="btn small" data-act="indent" title="들여쓰기 4칸">⇥</button>
    <button class="btn small" data-act="reset">초기화</button>
    <span class="saved muted small" data-saved></span>
  </div>
  <textarea class="editor" data-editor spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off">{html.escape(exercise)}</textarea>
  <div class="runrow">
    <button class="btn primary" data-act="run">▶ 채점</button>
    <span class="muted small" data-run-status></span>
  </div>
  <div class="results" data-results></div>
</section>"""
        else:
            practice = f"""<section class="card practice" id="practice">
  <h2><span class="step">3</span> 실습: 내 코드로 조립해서 통합 테스트</h2>
  <p>Lab 1~10 에서 작성한 코드를 모아 <code>mini_harness.py</code> 를 조립하고 통합 시나리오를 채점합니다. 아직 풀지 않은 랩은 정답 코드로 대신 채웁니다.</p>
  <ul class="assembly" data-assembly></ul>
  <div class="runrow">
    <button class="btn primary" data-act="run">▶ 통합 채점</button>
    <span class="muted small" data-run-status></span>
  </div>
  <div class="results" data-results></div>
</section>"""

        nav = '<nav class="pager">'
        nav += (f'<a href="{prev_l["id"]}.html">← {prev_l["n"]:02d} {html.escape(prev_l["short"])}</a>'
                if prev_l else '<a href="../index.html">← 목차</a>')
        nav += (f'<a class="next" href="{next_l["id"]}.html">{next_l["n"]:02d} {html.escape(next_l["short"])} →</a>'
                if next_l else '<a class="next" href="../index.html">목차로 →</a>')
        nav += "</nav>"

        body = f"""{topbar(1, f"Lab {l['n']:02d}", l['id'])}
<main class="wrap" data-lab="{l['id']}" data-has-exercise="{str(has_ex).lower()}">
  <section class="labhead">
    <p class="eyebrow">Lab {l['n']:02d} · 약 {l['minutes']}분</p>
    <h1>{html.escape(l['title'])}</h1>
    <ul class="points">{''.join(f'<li>{html.escape(p)}</li>' for p in l['points'])}</ul>
    <nav class="jump"><a href="#concept">개념</a><a href="#quiz">퀴즈</a><a href="#practice">실습</a><a href="#answer">정답</a></nav>
  </section>
  <section class="card prose" id="concept">
    <h2><span class="step">1</span> 개념</h2>
    {markdown(l['readme'])}
  </section>
  <section class="card" id="quiz">
    <h2><span class="step">2</span> 확인 퀴즈</h2>
    {''.join(quiz_html)}
  </section>
  {practice}
  <section class="card" id="answer">
    <h2><span class="step">4</span> 정답과 테스트</h2>
    <details><summary>정답 코드 보기 (<code>{sol_name}</code>)</summary><pre class="code"><code class="language-python">{html.escape(solution)}</code></pre></details>
    <details><summary>채점 테스트 보기 (<code>test_lab.py</code>)</summary><pre class="code"><code class="language-python">{html.escape(tests)}</code></pre></details>
    <label class="donebox"><input type="checkbox" data-done> 이 랩을 완료로 표시</label>
  </section>
  {nav}
</main>
<script type="application/json" id="lab-data">{json.dumps({"id": l["id"], "exercise": exercise, "pyodide": PYODIDE, "labs": meta}, ensure_ascii=False).replace("</", "<\\/")}</script>"""
        open(os.path.join(OUT, "labs", f"{l['id']}.html"), "w", encoding="utf-8").write(
            page(f"Lab {l['n']:02d} {l['title']} · 하네스 워크북", body, 1, l["points"][0]))

    # ---- PWA manifest
    json.dump({"name": content["title"], "short_name": "하네스 워크북", "start_url": "./index.html",
               "display": "standalone", "background_color": "#f6f3ec", "theme_color": "#f6f3ec",
               "icons": [{"src": "assets/icon.svg", "sizes": "any", "type": "image/svg+xml"}]},
              open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False)

    if "--zip" in sys.argv:
        zpath = os.path.join(OUT, "harness-lab.zip")
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for base, dirs, files in os.walk(ROOT):
                dirs[:] = [x for x in dirs if x not in ("site", "__pycache__", ".git")]
                for fn in files:
                    full = os.path.join(base, fn)
                    z.write(full, os.path.join("harness-lab", os.path.relpath(full, ROOT)))
    print(f"site/ 생성 완료: 랩 {len(labs)}개, 번들 파일 {len(bundle)}개")


if __name__ == "__main__":
    build()
