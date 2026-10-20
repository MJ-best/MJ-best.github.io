/* 하네스 워크북 — 진도 저장, 퀴즈, 편집기, 브라우저 채점(Pyodide) */
(function () {
  "use strict";
  var ROOT = document.body.getAttribute("data-root") || "";
  var TOTAL = 11;

  // ------------------------------------------------------------ storage
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("hl:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("hl:" + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem("hl:" + k); } catch (e) {} }
  };
  function doneMap() { return store.get("done", {}); }
  function setDone(id, v) { var m = doneMap(); if (v) m[id] = true; else delete m[id]; store.set("done", m); refreshProgress(); }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function refreshProgress() {
    var m = doneMap(), n = Object.keys(m).length;
    document.querySelectorAll("[data-progress-pill]").forEach(function (el) { el.textContent = n + "/" + TOTAL; });
    var bar = document.querySelector("[data-progress-bar]");
    if (bar) bar.style.width = Math.round(n / TOTAL * 100) + "%";
    var txt = document.querySelector("[data-progress-text]");
    if (txt && n) txt.textContent = TOTAL + "개 중 " + n + "개 완료 · 진행 상황은 이 기기 브라우저에 저장됩니다.";
    document.querySelectorAll(".labcard").forEach(function (a) {
      var id = a.getAttribute("data-lab"), d = !!m[id];
      a.classList.toggle("done", d);
      var s = a.querySelector("[data-state]");
      if (s) s.textContent = d ? "완료" : (store.get("draft:" + id, null) ? "진행 중" : "");
    });
    var cont = document.querySelector("[data-continue]");
    var metaEl = document.getElementById("labs-meta");
    if (cont && metaEl && n) {
      var labs = JSON.parse(metaEl.textContent);
      var next = labs.find(function (l) { return !m[l.id]; });
      if (next) { cont.href = "labs/" + next.id + ".html"; cont.textContent = "이어서: " + String(next.n).padStart(2, "0") + " " + next.short; }
      else { cont.textContent = "모두 완료! 처음부터 복습"; }
    }
    var box = document.querySelector("[data-done]");
    var main = document.querySelector("main[data-lab]");
    if (box && main) box.checked = !!m[main.getAttribute("data-lab")];
  }

  // ------------------------------------------------------------ highlight
  if (window.hljs) document.querySelectorAll("pre.code code").forEach(function (el) { try { window.hljs.highlightElement(el); } catch (e) {} });

  refreshProgress();

  var main = document.querySelector("main[data-lab]");
  if (!main) return;                                   // 표지 페이지는 여기까지
  var labId = main.getAttribute("data-lab");
  var data = JSON.parse(document.getElementById("lab-data").textContent);
  store.set("last", labId);

  // ------------------------------------------------------------ done box
  var doneBox = document.querySelector("[data-done]");
  if (doneBox) doneBox.addEventListener("change", function () { setDone(labId, doneBox.checked); });

  // ------------------------------------------------------------ quiz
  var quizState = store.get("quiz:" + labId, {});
  document.querySelectorAll(".quiz").forEach(function (qz) {
    var qi = qz.getAttribute("data-q"), ans = +qz.getAttribute("data-answer");
    var opts = qz.querySelectorAll(".opt"), why = qz.querySelector(".why");
    function mark(i) {
      opts.forEach(function (o, k) {
        o.classList.remove("right", "wrong");
        if (k === ans && i !== null) o.classList.add("right");
        if (k === i && i !== ans) o.classList.add("wrong");
        o.setAttribute("aria-pressed", k === i ? "true" : "false");
      });
      why.hidden = i === null;
      if (i !== null) why.textContent = (i === ans ? "정답! " : "아쉬워요. ") + why.getAttribute("data-why");
    }
    why.setAttribute("data-why", why.textContent);
    opts.forEach(function (o, k) {
      o.addEventListener("click", function () { quizState[qi] = k; store.set("quiz:" + labId, quizState); mark(k); });
    });
    mark(quizState[qi] === undefined ? null : quizState[qi]);
  });

  // ------------------------------------------------------------ editor
  var ed = document.querySelector("[data-editor]");
  var savedEl = document.querySelector("[data-saved]");
  if (ed) {
    var draft = store.get("draft:" + labId, null);
    if (draft !== null) { ed.value = draft; if (savedEl) savedEl.textContent = "저장된 작업을 불러왔어요"; }
    var timer;
    ed.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (ed.value === data.exercise) store.del("draft:" + labId); else store.set("draft:" + labId, ed.value);
        if (savedEl) savedEl.textContent = "자동 저장됨 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      }, 400);
    });
    bindKeys(ed);
  }
  function bindKeys(el) {
    el.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { e.preventDefault(); insertInto(el, "    "); }
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {          // 자동 들여쓰기
        var before = el.value.slice(0, el.selectionStart);
        var line = before.slice(before.lastIndexOf("\n") + 1);
        var indent = (line.match(/^\s*/) || [""])[0] + (/:\s*$/.test(line) ? "    " : "");
        e.preventDefault(); insertInto(el, "\n" + indent);
      }
    });
  }
  function insertInto(el, text) {
    var s = el.selectionStart, e = el.selectionEnd;
    el.setRangeText(text, s, e, "end");
    el.dispatchEvent(new Event("input"));
  }
  function insertAtCursor(text) { insertInto(ed, text); }
  function findTodo() {
    var re = /TODO\(\d+\)|raise NotImplementedError|TODO/g;
    var from = ed.selectionEnd, v = ed.value;
    re.lastIndex = from;
    var m = re.exec(v);
    if (!m) { re.lastIndex = 0; m = re.exec(v); }
    if (!m) { toast("남은 TODO 가 없어요 — 채점해 보세요!"); return; }
    ed.focus();
    ed.setSelectionRange(m.index, m.index + m[0].length);
    var lineNo = v.slice(0, m.index).split("\n").length;
    var lh = parseFloat(getComputedStyle(ed).lineHeight) || 21;
    ed.scrollTop = Math.max(0, (lineNo - 4) * lh);
  }

  document.querySelectorAll("[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var act = b.getAttribute("data-act");
      if (act === "todo") findTodo();
      if (act === "indent") { ed.focus(); insertAtCursor("    "); }
      if (act === "reset" && confirm("작성한 코드를 지우고 처음 상태로 되돌릴까요?")) {
        ed.value = data.exercise; store.del("draft:" + labId);
        if (savedEl) savedEl.textContent = "초기화했어요";
      }
      if (act === "run") runTests(b);
    });
  });

  // ------------------------------------------------------------ 따라 해보기 예제
  document.querySelectorAll(".example").forEach(function (ex) {
    var i = +ex.getAttribute("data-ex"), orig = (data.examples || [])[i] || "";
    var pre = ex.querySelector("[data-excode]"), ta = ex.querySelector("[data-exedit]");
    var runB = ex.querySelector("[data-exrun]"), editB = ex.querySelector("[data-exedit-toggle]");
    var resetB = ex.querySelector("[data-exreset]"), out = ex.querySelector("[data-exout]");
    var label = ex.querySelector("[data-exlabel]"), st = ex.querySelector("[data-exstatus]");
    var key = "ex:" + labId + ":" + i, saved = store.get(key, null);
    function fit() { ta.rows = Math.min(28, Math.max(6, ta.value.split("\n").length + 1)); }
    function openEditor() { ta.hidden = false; pre.hidden = true; resetB.hidden = false; editB.hidden = true; fit(); }
    ta.value = saved !== null ? saved : orig;
    if (saved !== null) openEditor();
    bindKeys(ta);
    ta.addEventListener("input", function () { if (ta.value === orig) store.del(key); else store.set(key, ta.value); fit(); });
    editB.addEventListener("click", function () { openEditor(); ta.focus(); });
    resetB.addEventListener("click", function () {
      ta.value = orig; store.del(key);
      ta.hidden = true; pre.hidden = false; resetB.hidden = true; editB.hidden = false;
    });
    runB.addEventListener("click", async function () {
      runB.disabled = true;
      try {
        var env = await getPy(function (t) { st.textContent = t; });
        st.textContent = "실행 중…";
        env.py.globals.set("_lab", labId);
        env.py.globals.set("_code", ta.hidden ? orig : ta.value);
        var r = env.py.runPython("run_snippet(_lab, _code)");
        out.textContent = r || "(출력 없음)";
        label.textContent = ta.hidden ? "방금 실행한 결과" : "고친 코드의 실행 결과";
        ex.classList.add("ran");
        st.textContent = "";
      } catch (e) {
        out.textContent = String(e && e.message || e); st.textContent = "";
      } finally { runB.disabled = false; }
    });
  });

  // ------------------------------------------------------------ capstone 조립표
  var asm = document.querySelector("[data-assembly]");
  function assemblyPlan() {
    return data.labs.filter(function (l) { return l.id !== labId; }).map(function (l) {
      return { id: l.id, n: l.n, short: l.short, mine: store.get("draft:" + l.id, null) !== null };
    });
  }
  if (asm) {
    asm.innerHTML = assemblyPlan().map(function (p) {
      return '<li class="' + (p.mine ? "mine" : "") + '">' + String(p.n).padStart(2, "0") + " " + p.short +
        " · " + (p.mine ? "내 코드" : "정답") + "</li>";
    }).join("");
  }

  // ------------------------------------------------------------ Pyodide 채점
  var pyReady = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("스크립트를 불러오지 못했어요: " + src)); };
      document.head.appendChild(s);
    });
  }
  function getPy(status) {
    if (pyReady) return pyReady;
    pyReady = (async function () {
      status("파이썬 엔진 내려받는 중… (처음 한 번, 약 10MB)");
      await loadScript(data.pyodide + "pyodide.js");
      var py = await window.loadPyodide({ indexURL: data.pyodide });
      status("실습 파일 준비 중…");
      var files = await (await fetch(ROOT + "assets/files.json")).json();
      var runner = await (await fetch(ROOT + "assets/runner.py")).text();
      for (var path in files) writeFile(py, "/harness-lab/" + path, files[path]);
      py.runPython(runner);
      return { py: py, files: files };
    })();
    pyReady.catch(function () { pyReady = null; });
    return pyReady;
  }
  function writeFile(py, path, text) {
    var dir = path.slice(0, path.lastIndexOf("/"));
    py.FS.mkdirTree(dir);
    py.FS.writeFile(path, text, { encoding: "utf8" });
  }

  async function runTests(btn) {
    var statusEl = document.querySelector("[data-run-status]");
    var out = document.querySelector("[data-results]");
    function status(t) { statusEl.textContent = t; }
    btn.disabled = true; out.innerHTML = "";
    try {
      var env = await getPy(status);
      var py = env.py;
      status("채점 중…");
      // 모든 랩의 exercise.py 를 '저장된 내 코드'로 (없으면 기본 연습/정답)
      data.labs.forEach(function (l) {
        var base = "/harness-lab/labs/" + l.id + "/";
        var orig = env.files["labs/" + l.id + "/exercise.py"];
        if (orig === undefined) return;
        var mine = store.get("draft:" + l.id, null);
        var useSolution = labId === "11_capstone" && mine === null;
        writeFile(py, base + "exercise.py", mine !== null ? mine : (useSolution ? env.files["labs/" + l.id + "/solution.py"] : orig));
      });
      if (ed) writeFile(py, "/harness-lab/labs/" + labId + "/exercise.py", ed.value);
      var r = JSON.parse(py.runPython("run_lab(" + JSON.stringify(labId) + ', "exercise")'));
      render(out, r);
      if (r.ok) {
        setDone(labId, true);
        status("통과! 완료로 표시했어요.");
      } else status("");
    } catch (e) {
      out.innerHTML = '<div class="summary bad">실행 오류</div><pre class="code">' + esc(String(e && e.message || e)) + "</pre>";
      status("");
    } finally { btn.disabled = false; }
  }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function hint(detail) {
    if (/NotImplementedError/.test(detail)) return "아직 채우지 않은 TODO 가 있어요.";
    if (/SyntaxError|IndentationError/.test(detail)) return "문법/들여쓰기 오류예요. 줄 번호를 확인하세요.";
    var m = detail.match(/AssertionError: ([^\n]+)/);
    if (!m) return "";
    var msg = m[1], cut = msg.lastIndexOf(" : ");          // 테스트가 적어둔 안내 문구 우선
    if (cut > -1) msg = msg.slice(cut + 3);
    return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
  }
  function render(out, r) {
    var html = '<div class="summary ' + (r.ok ? "ok" : "bad") + '">' + (r.ok ? "🎉 " : "") + r.passed + " / " + r.total + " 테스트 통과</div><ul class=\"tests\">";
    r.tests.forEach(function (t) {
      var nice = t.name.replace(/^test_/, "").replace(/_/g, " ");
      html += '<li class="' + (t.ok ? "ok" : "bad") + '">' + esc(nice);
      if (!t.ok) {
        var h = hint(t.detail || "");
        if (h) html += '<div class="muted" style="font-family:var(--sans)">' + esc(h) + "</div>";
        html += "<details><summary>자세히</summary><pre>" + esc(t.detail || "") + "</pre></details>";
      }
      html += "</li>";
    });
    out.innerHTML = html + "</ul>";
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
})();
