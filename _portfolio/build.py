#!/usr/bin/env python3
"""MJ-best 포트폴리오 빌더.

projects.json(프로젝트 내용) + site.json(소개 문구)을 읽어
  /index.html            메인(프로젝트 목록)
  /work/<slug>/index.html  프로젝트 상세(화면·동작 흐름·핵심 코드)
를 정적 HTML로 만든다. 이미지는 _portfolio/img/*.webp → /assets/img/ 로 복사.

사용: python3 _portfolio/build.py
"""
import html, json, re, shutil, textwrap
from pathlib import Path

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
P = json.loads((SRC / "projects.json").read_text("utf-8"))
SITE = json.loads((SRC / "site.json").read_text("utf-8"))
CATS = SITE["categories"]
BASE = "https://mj-best.github.io"
e = lambda s: html.escape(str(s), quote=True)


# ---------- tiny syntax highlighter (build time) ----------
KW = {
    "js": "const let var function return if else for while of in new await async import export from class extends this null undefined true false switch case break continue typeof try catch throw default",
    "typescript": "const let var function return if else for while of in new await async import export from class extends this null undefined true false switch case break continue typeof type interface as try catch throw default",
    "python": "def return if elif else for while in not and or import from class None True False with as try except raise lambda global yield pass break continue is",
    "kotlin": "fun val var return if else for while in when class object private internal override null true false is as import package data enum",
    "swift": "func let var return if else for while in guard switch case class struct enum private static self nil true false import extension protocol default break",
}
KW["javascript"] = KW["js"]


def highlight(code, lang):
    lang = (lang or "").lower()
    kws = set(KW.get(lang, KW["js"]).split())
    hash_c = lang in ("python",)
    pat = re.compile(
        r"(?P<c>" + (r"#[^\n]*|" if hash_c else "") + r"//[^\n]*|/\*[\s\S]*?\*/)"
        r"|(?P<s>\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)"
        r"|(?P<n>\b\d+(?:\.\d+)?\b)"
        r"|(?P<w>[A-Za-z_$][\w$]*)(?P<p>\s*\()?"
    )
    out, i = [], 0
    for m in pat.finditer(code):
        out.append(e(code[i:m.start()]))
        if m.group("c"):
            out.append(f'<span class="c">{e(m.group("c"))}</span>')
        elif m.group("s"):
            out.append(f'<span class="s">{e(m.group("s"))}</span>')
        elif m.group("n"):
            out.append(f'<span class="n">{e(m.group("n"))}</span>')
        else:
            w = m.group("w")
            if w in kws:
                out.append(f'<span class="k">{e(w)}</span>')
            elif m.group("p"):
                out.append(f'<span class="f">{e(w)}</span>')
            else:
                out.append(e(w))
            if m.group("p"):
                out.append(e(m.group("p")))
        i = m.end()
    out.append(e(code[i:]))
    return "".join(out)


# ---------- illustrated covers for apps without screenshots ----------
COVERS = {
"nuance": """<svg viewBox="0 0 800 500" role="img" aria-label="표현 사이의 관계와 적합도를 잇는 그래프 그림">
<rect width="800" height="500" fill="var(--accent-soft)"/>
<g stroke="var(--ink-3)" stroke-width="2" fill="none">
<path d="M220 250 L470 140"/><path d="M220 250 L470 360" stroke-dasharray="6 6"/><path d="M470 140 L640 230"/><path d="M220 250 L120 120"/><path d="M220 250 L130 390"/></g>
<g font-family="IBM Plex Mono,monospace" font-size="15" fill="var(--ink-2)">
<text x="320" y="180">90%</text><text x="320" y="335">45%</text><text x="560" y="170">일상 고백</text></g>
<g font-family="IBM Plex Sans KR,sans-serif" font-weight="600" text-anchor="middle">
<circle cx="220" cy="250" r="54" fill="var(--accent)"/><text x="220" y="258" font-size="22" fill="var(--accent-ink)">사랑해</text>
<circle cx="470" cy="140" r="46" fill="var(--card)" stroke="var(--accent)" stroke-width="3"/><text x="470" y="148" font-size="22" fill="var(--ink)">好き</text>
<circle cx="470" cy="360" r="50" fill="var(--card)" stroke="var(--line-2)" stroke-width="2"/><text x="470" y="367" font-size="19" fill="var(--ink-2)">愛してる</text>
<circle cx="640" cy="230" r="34" fill="var(--card)" stroke="var(--line-2)" stroke-width="2"/><text x="640" y="236" font-size="15" fill="var(--ink-2)">I like you</text>
<circle cx="120" cy="120" r="30" fill="var(--card)" stroke="var(--line-2)" stroke-width="2"/><text x="120" y="126" font-size="15" fill="var(--ink-2)">좋아해</text>
<circle cx="130" cy="390" r="30" fill="var(--card)" stroke="var(--line-2)" stroke-width="2"/><text x="130" y="396" font-size="14" fill="var(--ink-2)">люблю</text></g></svg>""",
"shutter": """<svg viewBox="0 0 800 500" role="img" aria-label="아이폰이 블루투스로 카메라 셔터를 누르는 흐름 그림">
<rect width="800" height="500" fill="var(--accent-soft)"/>
<g fill="none" stroke="var(--ink)" stroke-width="3">
<rect x="120" y="120" width="140" height="260" rx="26" fill="var(--card)"/>
<rect x="500" y="170" width="200" height="140" rx="18" fill="var(--card)"/>
<rect x="545" y="150" width="60" height="22" rx="5" fill="var(--card)"/>
<circle cx="600" cy="240" r="42"/><circle cx="600" cy="240" r="24" stroke="var(--accent)"/></g>
<circle cx="190" cy="300" r="34" fill="var(--accent)"/>
<g stroke="var(--accent)" stroke-width="3" fill="none" stroke-linecap="round">
<path d="M300 250 H460" stroke-dasharray="2 12"/><path d="M445 235 L462 250 L445 265"/>
<path d="M330 205 q20 -25 40 0"/><path d="M318 190 q32 -42 64 0"/></g>
<g font-family="IBM Plex Mono,monospace" font-size="15" fill="var(--ink-2)" text-anchor="middle">
<text x="380" y="290">BLE GATT write</text><text x="190" y="420">iPhone · 리모컨 흉내</text><text x="600" y="350">Sony · Canon · Nikon</text></g>
<text x="190" y="190" text-anchor="middle" font-family="IBM Plex Sans KR,sans-serif" font-weight="700" font-size="20" fill="var(--ink)">셔터</text></svg>""",
}


def arch_cover(p):
    nodes = p["arch"]["nodes"][:5]
    n = len(nodes); W = 800; bw = min(150, (W - 60 - 30 * (n - 1)) // n); gap = (W - 60 - bw * n) // max(n - 1, 1)
    g = []
    for i, nd in enumerate(nodes):
        x = 30 + i * (bw + gap); y = 175
        hl = i == 0
        g.append(f'<rect x="{x}" y="{y}" width="{bw}" height="100" rx="14" fill="{'var(--accent)' if hl else 'var(--card)'}" stroke="{'var(--accent)' if hl else 'var(--line-2)'}" stroke-width="2"/>')
        g.append(f'<text x="{x + bw / 2}" y="{y + 46}" text-anchor="middle" font-family="IBM Plex Sans KR,sans-serif" font-weight="600" font-size="14" fill="{'var(--accent-ink)' if hl else 'var(--ink)'}">{e(nd["label"].split(" ·")[0][:14])}</text>')
        g.append(f'<text x="{x + bw / 2}" y="{y + 72}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="11" fill="{'var(--accent-ink)' if hl else 'var(--ink-3)'}">{e((nd.get("sub") or "").split(" · ")[0][:16])}</text>')
        if i < n - 1:
            ax = x + bw + 6; bx = x + bw + gap - 6
            g.append(f'<path d="M{ax} 225 H{bx}" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-dasharray="2 7" stroke-linecap="round"/><path d="M{bx - 8} 218 L{bx} 225 L{bx - 8} 232" stroke="var(--accent)" stroke-width="2.5" fill="none"/>')
    return f'<svg viewBox="0 0 800 450" role="img" aria-label="{e(p["title"])} 구조 그림"><rect width="800" height="450" fill="var(--accent-soft)"/>{"".join(g)}</svg>'


def cover_svg(p):
    return COVERS[p["cover"]] if p["cover"] in COVERS else arch_cover(p)


def thumb_html(p, big=False):
    if p.get("thumb") and not big:
        return f'<img src="/assets/img/{p["thumb"]}.webp" alt="{e(p["title"])} 화면" loading="lazy" decoding="async">'
    if p.get("cover"):
        return cover_svg(p)
    s = p["shots"][0]
    name = s["img"] + ("" if big else "-t")
    return f'<img src="/assets/img/{name}.webp" alt="{e(p["title"])} 화면" loading="lazy" decoding="async">'


# ---------- page shell ----------
THEME_JS = """<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>"""


def shell(title, desc, path, body, og_img=None, extra_head=""):
    url = BASE + path
    og = f'<meta property="og:image" content="{BASE}/assets/img/{og_img}.webp">' if og_img else ""
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{SITE.get("head_extra", "")}
<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">{og}
<meta name="theme-color" content="#f5f3ee" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#141619" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/portfolio.css">
{THEME_JS}{extra_head}
</head>
<body>
<a class="skip" href="#main">본문으로 건너뛰기</a>
<header class="top"><div class="wrap">
<a class="logo" href="/"><i aria-hidden="true"></i>MJ-best</a>
<nav aria-label="주 메뉴">
<a href="/#projects">프로젝트</a><a class="hide-s" href="/#stack">구조</a><a class="hide-s" href="/#about">작업 방식</a><a href="{SITE['github']}" rel="noopener">GitHub</a>
<button class="theme-btn" type="button" aria-label="밝게/어둡게 전환" title="밝게/어둡게 전환"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg></button>
</nav></div></header>
<main id="main">
{body}
</main>
<footer><div class="wrap"><span>© {SITE['year']} MJ-best · 이 사이트와 모든 데모는 GitHub Pages에서 동작합니다.</span><a href="{SITE['github']}">github.com/MJ-best</a></div></footer>
<script src="/assets/portfolio.js" defer></script>
</body>
</html>
"""


def is_external(u):
    return u.startswith("http")


def link_attrs(u):
    return ' rel="noopener"' if is_external(u) else ""


# ---------- index ----------
def build_index():
    counts = {k: sum(1 for p in P if p["cat"] == k) for k in CATS}
    chips = [f'<button class="chip" type="button" data-filter="all" aria-pressed="true">전체<span class="n">{len(P)}</span></button>']
    chips += [f'<button class="chip" type="button" data-filter="{k}" aria-pressed="false">{e(v)}<span class="n">{counts[k]}</span></button>' for k, v in CATS.items()]
    cards = []
    for p in P:
        demo = next((l for l in p["links"] if not l["url"].startswith("https://github.com")), None)
        demo_html = f'<a class="demo" href="{e(demo["url"])}"{link_attrs(demo["url"])}>{e(demo["label"])} ↗</a>' if demo else ""
        tags = "".join(f'<span class="tag">{e(re.sub(r"\s*\(.*?\)", "", t))}</span>' for t in p["stack"][:3])
        cards.append(f"""<article class="card" data-cat="{p['cat']}">
<div class="thumb">{thumb_html(p)}</div>
<div class="body">
<div class="kicker"><span class="dot" aria-hidden="true"></span>{e(CATS[p['cat']])} · {e(p['platform'])}</div>{'<span class="priv">비공개 저장소</span>' if p.get('private') else ''}
<h3><a href="/work/{p['slug']}/">{e(p['title'])}</a></h3>
<p>{e(p['summary'])}</p>
{demo_html}
<div class="tags">{tags}</div>
</div></article>""")
    others = "".join(f'<a href="{e(o["url"])}" rel="noopener"><b>{e(o["title"])}</b><span>{e(o["desc"])}</span></a>' for o in SITE["others"])
    ways = "".join(f'<li><b>{e(w[0])}</b><span>{e(w[1])}</span></li>' for w in SITE["ways"])
    stats = "".join(f'<div><b>{e(s[0])}</b><span>{e(s[1])}</span></div>' for s in SITE["stats"])
    body = f"""<section class="hero"><div class="wrap">
<p class="eyebrow">{e(SITE['eyebrow'])}</p>
<h1>{SITE['headline']}</h1>
<p class="lead">{e(SITE['lead'])}</p>
<div class="stats">{stats}</div>
</div></section>
<section class="wrap" id="projects" aria-labelledby="h-projects">
<div class="section-head"><h2 id="h-projects">프로젝트</h2><div class="chips" role="group" aria-label="분야로 거르기">{''.join(chips)}</div></div>
<div class="grid">{''.join(cards)}</div>
<div class="section-head"><h2>그 밖의 작업</h2></div>
<div class="others">{others}</div>
{stack_html()}
<div class="about" id="about"><div><h2>작업 방식</h2><p>{e(SITE['about'])}</p></div><ul>{ways}</ul></div>
</section>"""
    (ROOT / "index.html").write_text(shell(SITE["title"], SITE["description"], "/", body, og_img=P[0]["shots"][0]["img"]), "utf-8")


def stack_html():
    st = SITE["stack"]
    slug = {p["id"]: p for p in P}
    pipe = "".join(f'<div><small>{i + 1:02d}</small><b>{e(s[0])}</b><span>{e(s[1])}</span></div>' for i, s in enumerate(st["pipeline"]))
    pats = []
    for pt in st["patterns"]:
        items = "".join(f'<li><a href="/work/{slug[i]["slug"]}/">{e(slug[i]["title"])}</a></li>' for i in pt.get("projects", []) if i in slug)
        pats.append(f'<div class="pattern{" next" if pt.get("next") else ""}"><h3>{e(pt["title"])}</h3><p>{e(pt["desc"])}</p>{"<ul>" + items + "</ul>" if items else ""}</div>')
    return f"""<section class="stack" id="stack" aria-labelledby="h-stack"><div class="section-head" style="margin-top:0"><h2 id="h-stack">{e(st['title'])}</h2></div>
<p class="stack-lead">{e(st['lead'])}</p><div class="pipe">{pipe}</div><div class="patterns">{''.join(pats)}</div></section>"""


# ---------- detail ----------
def build_detail(i, p):
    base = p["repo_base"]
    btns = []
    for j, l in enumerate(p["links"]):
        cls = "btn primary" if j == 0 and not l["url"].startswith("https://github.com") else "btn"
        btns.append(f'<a class="{cls}" href="{e(l["url"])}"{link_attrs(l["url"])}>{e(l["label"])}{" ↗" if is_external(l["url"]) or l["url"].startswith("/") else ""}</a>')

    # screenshots
    if p["shots"]:
        def is_phone(name):
            if any(s.get("phone") for s in p["shots"] if s["img"] == name):
                return True
            return any(k in name for k in ("-m", "vr-reading", "vr-fix", "vr-voices", "np3-android"))
        main, rest = p["shots"][0], p["shots"][1:]
        def fig(s, cls=""):
            return f'<figure><a href="/assets/img/{s["img"]}.webp" aria-label="원본 크기로 보기: {e(s["caption"])}"><img src="/assets/img/{s["img"]}.webp" alt="{e(s["caption"])}" loading="lazy" decoding="async"></a><figcaption>{e(s["caption"])}</figcaption></figure>'
        if is_phone(main["img"]):
            shots = '<div class="shot-row phones">' + "".join(fig(s) for s in p["shots"]) + "</div>"
        else:
          shots = f'<figure class="shot-main"><a href="/assets/img/{main["img"]}.webp"><img src="/assets/img/{main["img"]}.webp" alt="{e(main["caption"])}" decoding="async"></a></figure><figcaption style="margin-top:-6px">{e(main["caption"])}</figcaption>'
          wide = [s for s in rest if not is_phone(s["img"])]
          phones = [s for s in rest if is_phone(s["img"])]
          if wide:
              shots += '<div class="shot-row">' + "".join(fig(s) for s in wide) + "</div>"
          if phones:
              shots += '<div class="shot-row phones">' + "".join(fig(s) for s in phones) + "</div>"
    else:
        shots = f'<div class="cover-big">{cover_svg(p)}</div><figcaption>{e(p.get("cover_note", "저장소에 공개된 화면 이미지가 없어, 동작 원리를 그림으로 대신합니다."))}</figcaption>'

    feats = "".join(f"<li>{e(f)}</li>" for f in p["features"])
    nums = "".join(f"<div>{e(n)}</div>" for n in p["numbers"])
    flow = "".join(
        (f'<li><h3>{e(s["title"])}</h3><p>{e(s["detail"])}</p><span class="file">{e(s["file"])}</span></li>' if p.get("private") else f'<li><h3>{e(s["title"])}</h3><p>{e(s["detail"])}</p><a class="file" href="{e(base + s["file"])}" rel="noopener">{e(s["file"])}</a></li>')
        for s in p["flow"]
    )
    if p.get("private"):
        nodes = p["arch"]["nodes"]; edges = p["arch"]["edges"]
        lab = {(x["from"], x["to"]): x.get("label", "") for x in edges}
        name = {nd["id"]: nd["label"] for nd in nodes}
        parts = []
        for i, nd in enumerate(nodes):
            parts.append(f'<div class="node{" first" if i == 0 else ""}"><b>{e(nd["label"])}</b><span>{e(nd.get("sub", ""))}</span></div>')
            if i < len(nodes) - 1:
                l = lab.get((nd["id"], nodes[i + 1]["id"])) or lab.get((nodes[i + 1]["id"], nd["id"]), "")
                parts.append(f'<div class="edge" aria-hidden="true"><span>{e(l)}</span></div>')
        chain = {(nodes[i]["id"], nodes[i + 1]["id"]) for i in range(len(nodes) - 1)} | {(nodes[i + 1]["id"], nodes[i]["id"]) for i in range(len(nodes) - 1)}
        extra = "".join(f'<li>{e(name.get(x["from"], x["from"]))} → {e(name.get(x["to"], x["to"]))}{": " + e(x["label"]) if x.get("label") else ""}</li>' for x in edges if (x["from"], x["to"]) not in chain)
        code_sec = f"""<section class="d-sec" id="code"><h2>구조</h2><p class="backend">{e(p.get('backend', ''))}</p><div class="arch">{''.join(parts)}</div>{'<ul class="arch-extra">' + extra + '</ul>' if extra else ''}<p class="code-cap">비공개 저장소라 소스 코드 링크와 코드 발췌는 싣지 않았습니다.</p></section>"""
        toc_code = "구조"
    else:
        sn = p["snippet"]
        code = highlight(textwrap.dedent(sn["code"].expandtabs(4)).strip("\n"), sn.get("lang"))
        code_sec = f"""<section class="d-sec" id="code"><h2>핵심 코드</h2>
<div class="code"><div class="code-bar"><span>{e(sn['file'])}</span><a href="{e(base + sn['file'])}" rel="noopener">GitHub에서 보기 ↗</a></div><pre><code>{code}</code></pre></div>
<p class="code-cap">{e(sn['caption'])}</p></section>"""
        toc_code = "핵심 코드"
    prev_p, next_p = P[i - 1], P[(i + 1) % len(P)]
    gh = next((l["url"] for l in p["links"] if l["url"].startswith("https://github.com")), None)
    meta = [("분야", CATS[p["cat"]]), ("플랫폼", p["platform"]), ("기술", " · ".join(p["stack"]))] + ([("저장소", "비공개")] if p.get("private") else [])
    meta_html = "".join(f"<span><b>{k}</b>{e(v)}</span>" for k, v in meta)

    body = f"""<div class="wrap">
<nav class="crumb" aria-label="위치"><a href="/#projects">← 전체 프로젝트</a></nav>
<header class="d-head"><div>
<p class="eyebrow" style="margin:0">{e(CATS[p['cat']])}</p>
<h1>{e(p['title'])}</h1>
<p>{e(p['summary'])}</p>
</div><div class="btns">{''.join(btns)}</div></header>
<div class="meta">{meta_html}</div>
<section class="shots" aria-label="화면">{shots}</section>
<div class="d-grid">
<aside class="toc" aria-label="이 페이지 목차"><ol>
<li><a href="#why">왜 만들었나</a></li><li><a href="#features">주요 기능</a></li><li><a href="#flow">어떻게 동작하나</a></li><li><a href="#code">{toc_code}</a></li><li><a href="#hard">어려웠던 점</a></li></ol></aside>
<article>
<section class="d-sec" id="why"><h2>왜 만들었나</h2><p>{e(p['problem'])}</p></section>
<section class="d-sec" id="features"><h2>주요 기능</h2><ul class="feat">{feats}</ul></section>
<section class="d-sec"><h2>숫자로 보면</h2><div class="nums">{nums}</div></section>
<section class="d-sec" id="flow"><h2>어떻게 동작하나</h2><ol class="flow">{flow}</ol></section>
{code_sec}
<section class="d-sec" id="hard"><h2>어려웠던 점</h2><div class="callout">{e(p['hard_part'])}</div></section>
<nav class="pager" aria-label="다른 프로젝트">
<a href="/work/{prev_p['slug']}/"><small>← 이전</small><b>{e(prev_p['title'])}</b></a>
<a class="next" href="/work/{next_p['slug']}/"><small>다음 →</small><b>{e(next_p['title'])}</b></a></nav>
</article></div></div>"""
    out = ROOT / "work" / p["slug"]
    out.mkdir(parents=True, exist_ok=True)
    og = p["shots"][0]["img"] if p["shots"] else None
    (out / "index.html").write_text(shell(f"{p['title']} · MJ-best", p["summary"], f"/work/{p['slug']}/", body, og_img=og), "utf-8")


def build_assets():
    a = ROOT / "assets"
    (a / "img").mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC / "style.css", a / "portfolio.css")
    shutil.copy(SRC / "portfolio.js", a / "portfolio.js")
    shutil.copy(SRC / "favicon.svg", a / "favicon.svg")
    used = set()
    for p in P:
        for s in p["shots"]:
            used |= {s["img"], s["img"] + "-t"}
        if p.get("thumb"):
            used.add(p["thumb"])
    for f in (SRC / "img").glob("*.webp"):
        if f.stem in used:
            shutil.copy(f, a / "img" / f.name)


def build_sitemap():
    urls = ["/"] + [f"/work/{p['slug']}/" for p in P] + SITE.get("sitemap_extra", [])
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "".join(f"  <url><loc>{BASE}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
    (ROOT / "sitemap.xml").write_text(xml, "utf-8")


if __name__ == "__main__":
    build_assets()
    build_index()
    for i, p in enumerate(P):
        build_detail(i, p)
    build_sitemap()
    print(f"built index + {len(P)} detail pages")
