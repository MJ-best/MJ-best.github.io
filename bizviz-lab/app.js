(function () {
  "use strict";
  const DAX = window.DAX, G = window.BIZVIZ_GRID, C = window.BIZVIZ_CONTENT;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bizviz:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bizviz:" + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
  };

  // ───────── 모델 준비 ─────────
  const model = new DAX.Model(window.BIZVIZ_MODEL);
  const engine = new DAX.Engine(model);
  const BUILTIN = new Set([...model.measures.keys()]);
  const BASECOLS = new Map([...model.tables.values()].map((t) => [t.name, new Set(t.columns.map((c) => c.name.toLowerCase()))]));
  let userMeasures = store.get("measures", []);
  let userCols = store.get("columns", []);
  userMeasures = userMeasures.filter((m) => { try { if (BUILTIN.has(m.name.toLowerCase())) return false; model.setMeasure(m.name, m.expr, m.format, "_측정값"); return true; } catch (e) { return false; } });
  userCols = userCols.filter((c) => { try { model.addColumn(c.table, c.name, G.computeColumn(model, engine, c.table, DAX.parse(c.expr))); return true; } catch (e) { return false; } });

  const qname = (t) => (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(t) ? t : `'${t.replace(/'/g, "''")}'`);
  const fmtV = (v, f) => (v === null || v === undefined ? "" : DAX.formatValue(v, f));
  const lbl = (v) => (typeof v === "number" ? String(v) : fmtV(v));

  // ───────── 문법 강조 ─────────
  const KW = new Set(["VAR", "RETURN", "IN", "NOT", "TRUE", "FALSE", "ASC", "DESC", "DENSE", "SKIP", "DAY", "MONTH", "QUARTER", "YEAR", "WEEK"]);
  function highlight(src, errPos) {
    let out = "", i = 0;
    const n = src.length;
    const push = (cls, s, start) => {
      let html = esc(s);
      if (errPos !== undefined && errPos >= start && errPos < start + Math.max(1, s.length)) html = `<span class="hl-err">${html}</span>`;
      out += cls ? `<span class="${cls}">${html}</span>` : html;
    };
    while (i < n) {
      const c = src[i], st = i;
      if ((c === "/" && src[i + 1] === "/") || (c === "-" && src[i + 1] === "-")) { let j = src.indexOf("\n", i); if (j < 0) j = n; push("hl-cm", src.slice(i, j), st); i = j; continue; }
      if (c === "/" && src[i + 1] === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; push("hl-cm", src.slice(i, j), st); i = j; continue; }
      if (c === '"') { let j = i + 1; while (j < n && !(src[j] === '"' && src[j + 1] !== '"')) j += src[j] === '"' ? 2 : 1; j = Math.min(n, j + 1); push("hl-str", src.slice(i, j), st); i = j; continue; }
      if (c === "'") { let j = src.indexOf("'", i + 1); j = j < 0 ? n : j + 1; push("hl-tbl", src.slice(i, j), st); i = j; continue; }
      if (c === "[") {
        let j = src.indexOf("]", i + 1); j = j < 0 ? n : j + 1;
        const name = src.slice(i + 1, j - 1);
        const prev = src.slice(0, i).match(/(['\p{L}\p{N}_]+)\s*$/u);
        const isCol = prev && !/^(VAR|RETURN)$/i.test(prev[1]) && (prev[1].endsWith("'") || model.hasTable(prev[1]));
        push(isCol ? "hl-col" : model.measures.has(name.toLowerCase()) ? "hl-ms" : "hl-col", src.slice(i, j), st); i = j; continue;
      }
      if (/[0-9]/.test(c)) { const m = /^\d+\.?\d*/.exec(src.slice(i)); push("hl-num", m[0], st); i += m[0].length; continue; }
      if (/[\p{L}_]/u.test(c)) {
        const m = /^[\p{L}\p{N}_.]+/u.exec(src.slice(i)); const w = m[0]; const up = w.toUpperCase();
        const after = src.slice(i + w.length).match(/^\s*\(/);
        if (after && DAX.FN[up]) push("hl-fn", w, st);
        else if (KW.has(up)) push("hl-kw", w, st);
        else if (model.hasTable(w)) push("hl-tbl", w, st);
        else push("", w, st);
        i += w.length; continue;
      }
      push(/[+\-*/^&=<>]/.test(c) ? "hl-op" : "", c, st); i++;
    }
    return out;
  }

  // ───────── 에디터 ─────────
  const FN_LIST = DAX.functionList();
  function Editor(root, opts) {
    root.classList.add("ed");
    root.innerHTML = '<pre aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="DAX 식 입력"></textarea><span class="placeholder"></span>';
    const pre = $("pre", root), ta = $("textarea", root), ph = $(".placeholder", root);
    ph.textContent = opts.placeholder || "";
    const sugg = document.createElement("div");
    sugg.className = "sugg";
    root.after(sugg);
    let items = [], sel = 0, errPos;
    function fit() { ta.style.height = "auto"; ta.style.height = Math.max(opts.minHeight || 120, ta.scrollHeight + 2) + "px"; }
    function render() { pre.innerHTML = highlight(ta.value, errPos) + "\n"; ph.hidden = !!ta.value; fit(); }
    function tokenBefore() {
      const pre = ta.value.slice(0, ta.selectionStart);
      let m = /([\p{L}\p{N}_']+)?\[([^\]\n]*)$/u.exec(pre);
      if (m) return { kind: "br", table: m[1] ? m[1].replace(/'/g, "") : null, text: m[2], len: m[2].length + 1 };
      m = /'([^'\n]*)$/.exec(pre);
      if (m && (pre.match(/'/g) || []).length % 2 === 1) return { kind: "q", text: m[1], len: m[1].length + 1 };
      m = /[\p{L}_][\p{L}\p{N}_.]*$/u.exec(pre);
      if (m) return { kind: "id", text: m[0], len: m[0].length };
      return null;
    }
    function callHint() {
      const pre = ta.value.slice(0, ta.selectionStart);
      let depth = 0, inStr = false;
      for (let i = pre.length - 1; i >= 0; i--) {
        const c = pre[i];
        if (c === '"') inStr = !inStr;
        if (inStr) continue;
        if (c === ")") depth++;
        else if (c === "(") { if (depth === 0) { const m = /([\p{L}_][\p{L}\p{N}_.]*)\s*$/u.exec(pre.slice(0, i)); if (m && DAX.FN[m[1].toUpperCase()]) return DAX.FN[m[1].toUpperCase()]; return null; } depth--; }
      }
      return null;
    }
    function suggest() {
      const tk = tokenBefore();
      items = [];
      if (tk) {
        const t = tk.text.toLowerCase();
        if (tk.kind === "br") {
          if (tk.table && model.hasTable(tk.table)) model.table(tk.table).columns.forEach((c) => { if (c.name.toLowerCase().includes(t)) items.push({ label: `[${c.name}]`, ins: `[${c.name}]`, len: tk.len }); });
          else {
            [...model.measures.values()].forEach((m) => { if (m.name.toLowerCase().includes(t)) items.push({ label: `[${m.name}]`, ins: `[${m.name}]`, len: tk.len }); });
          }
        } else if (tk.kind === "q") {
          [...model.tables.values()].forEach((x) => { if (x.name.toLowerCase().startsWith(t)) items.push({ label: `'${x.name}'`, ins: `'${x.name}'`, len: tk.len }); });
        } else if (tk.text.length >= 1) {
          const up = tk.text.toUpperCase();
          [...model.tables.values()].forEach((x) => { if (x.name.toLowerCase().startsWith(t) && x.name.toLowerCase() !== t) items.push({ label: x.name, ins: qname(x.name), len: tk.len }); });
          FN_LIST.filter((f) => f.name.startsWith(up) && f.name !== up).sort((a, b) => a.name.length - b.name.length).forEach((f) => items.push({ label: f.name + "(", ins: f.name + "(", len: tk.len, sig: f.sig }));
          ["VAR", "RETURN"].forEach((k) => { if (k.startsWith(up) && k !== up) items.push({ label: k, ins: k + " ", len: tk.len }); });
        }
      }
      items = items.slice(0, 8); sel = 0;
      const hint = callHint();
      sugg.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}" class="${i === sel ? "on" : ""}" title="${esc(it.sig || "")}">${esc(it.label)}</button>`).join("") +
        (items.length ? '<span class="hint">Tab으로 선택</span>' : hint ? `<span class="hint"><code>${esc(hint.sig)}</code> — ${esc(hint.desc)}</span>` : "");
    }
    function accept(i) {
      const it = items[i]; if (!it) return;
      const s = ta.selectionStart;
      ta.setRangeText(it.ins, s - it.len, s, "end");
      ta.focus(); errPos = undefined; render(); suggest(); opts.onChange && opts.onChange();
    }
    sugg.addEventListener("mousedown", (e) => { const b = e.target.closest("button[data-i]"); if (b) { e.preventDefault(); accept(+b.dataset.i); } });
    ta.addEventListener("input", () => { errPos = undefined; render(); suggest(); opts.onChange && opts.onChange(); });
    ta.addEventListener("click", suggest);
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); opts.onRun && opts.onRun(); return; }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        if (items.length) accept(sel); else { ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); render(); }
        return;
      }
      if (items.length && (e.key === "ArrowDown" || e.key === "ArrowUp") && e.altKey) {
        e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        $$("button", sugg).forEach((b, i) => b.classList.toggle("on", i === sel));
      }
      if (e.key === "Escape") { items = []; sugg.innerHTML = ""; }
    });
    ta.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== ta) { items = []; const h = callHint(); sugg.innerHTML = h ? `<span class="hint"><code>${esc(h.sig)}</code></span>` : ""; } }, 150));
    const api = {
      get: () => ta.value,
      set: (v) => { ta.value = v; errPos = undefined; render(); suggest(); },
      insert: (text) => { const s = ta.selectionStart, e2 = ta.selectionEnd; ta.setRangeText(text, s, e2, "end"); ta.focus(); render(); suggest(); opts.onChange && opts.onChange(); },
      focus: () => ta.focus(),
      markError: (pos) => { errPos = pos; render(); },
      ta,
    };
    render();
    return api;
  }

  function errorHTML(e, src, offset) {
    let html = `<div class="err"><b>오류</b> · ${esc(e.message)}`;
    if (typeof e.pos === "number" && src) {
      const p = e.pos + (offset || 0);
      const lineStart = src.lastIndexOf("\n", p - 1) + 1;
      let lineEnd = src.indexOf("\n", p); if (lineEnd < 0) lineEnd = src.length;
      const line = src.slice(lineStart, lineEnd);
      html += `<pre>${esc(line)}\n${[...src.slice(lineStart, p)].map((ch) => (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffe6]/.test(ch) ? "\u3000" : " ")).join("")}^</pre>`;
    }
    if (!e.isDax) html += `<pre>${esc(String(e.stack || ""))}</pre>`;
    return html + "</div>";
  }
  function defParts(text) {
    const d = G.splitDef(text);
    const offset = d.name ? text.indexOf(d.expr, text.indexOf("=")) : 0;
    return { name: d.name, expr: d.expr, offset: Math.max(0, offset) };
  }

  // ───────── 행렬 렌더링 ─────────
  function gridHTML(grid, fmt, opts) {
    opts = opts || {};
    const { rRef, cRef } = grid;
    const isNum = (v) => typeof v === "number" && isFinite(v);
    const all = [].concat(...grid.cells).filter(isNum);
    const max = Math.max(...all.map(Math.abs), 0);
    const bars = !cRef && max > 0 && all.length > 1;
    const bad = opts.bad || new Set();
    const K = DAX.keyOf;
    let h = '<div class="tblwrap"><table class="mx"><thead><tr>';
    h += `<th>${rRef ? esc(rRef.col) : ""}</th>`;
    if (cRef) grid.colVals.forEach((cv) => (h += `<th>${esc(lbl(cv))}</th>`));
    else h += `<th>${esc(opts.title || "값")}</th>`;
    if (cRef) h += "<th>합계</th>";
    h += "</tr></thead><tbody>";
    const cell = (v, r, c, cls) => {
      const key = (r === null ? "T" : K(r)) + "|" + (c === null ? "T" : K(c));
      const b = bars && cls === "" && isNum(v) ? `<span class="bar" style="width:${Math.round((Math.abs(v) / max) * 60)}px"></span>` : "";
      return `<td class="num cell ${cls} ${bad.has(key) ? "bad" : ""}" data-r="${r === null ? "" : esc(K(r))}" data-c="${c === null ? "" : esc(K(c))}">${b}${esc(fmtV(v, fmt))}</td>`;
    };
    if (rRef) {
      grid.rowVals.forEach((rv, i) => {
        h += `<tr><td>${esc(lbl(rv)) || "(빈 값)"}</td>`;
        if (cRef) { grid.cells[i].forEach((v, j) => (h += cell(v, rv, grid.colVals[j], ""))); h += cell(grid.rowTot[i], rv, null, "totc"); }
        else h += cell(grid.cells[i][0], rv, null, "");
        h += "</tr>";
      });
    }
    if (cRef || rRef) {
      h += `<tr class="tot"><td>합계</td>`;
      if (cRef) { (rRef ? grid.colTot : grid.cells[0]).forEach((v, j) => (h += cell(v, null, grid.colVals[j], ""))); }
      h += cell(grid.grand, null, null, "");
      h += "</tr>";
    }
    h += "</tbody></table></div>";
    return h;
  }
  function tvHTML(tv, limit, newColIndex) {
    const rows = tv.rows.slice(0, limit);
    let h = '<div class="tblwrap"><table class="mx"><thead><tr>';
    tv.cols.forEach((c, i) => (h += `<th class="${i === newColIndex ? "newc" : ""}">${esc(c.name)}</th>`));
    h += "</tr></thead><tbody>";
    rows.forEach((r) => { h += "<tr>"; r.vals.forEach((v, i) => (h += `<td class="${typeof v === "number" ? "num" : ""} ${i === newColIndex ? "newc" : ""}">${esc(typeof v === "number" && Number.isInteger(v) && Math.abs(v) < 10000 ? String(v) : fmtV(v, typeof v === "number" && !Number.isInteger(v) && Math.abs(v) < 1 ? "0.####" : undefined))}</td>`)); h += "</tr>"; });
    h += "</tbody></table></div>";
    return h;
  }

  // ───────── DAX 랩 ─────────
  const AXES = [
    ["", "(없음)"], ["제품[분류명]"], ["제품[제품분류명]"], ["제품[제품명]"], ["거래처[채널]"], ["거래처[지역]"], ["거래처[거래처명]"],
    ["날짜[연도]"], ["날짜[분기]"], ["날짜[월]"], ["날짜[월이름]"], ["날짜[연월]"], ["날짜[요일]"], ["날짜[주말여부]"],
  ];
  const SLICERS = [["날짜[연도]", "연도"], ["날짜[월]", "월"], ["제품[분류명]", "분류명"], ["거래처[채널]", "채널"], ["거래처[지역]", "지역"]];
  const lab = store.get("lab", { mode: "measure", table: "판매", fmt: "auto", rows: "제품[분류명]", cols: "", slicers: {} });
  lab.sel = null;
  const EXAMPLES = [
    ["measure", "기본 · 총매출", "총매출 = SUM(판매[매출금액])"],
    ["measure", "CALCULATE · 매장 매출", "매출_매장 = CALCULATE([총매출금액], FILTER('거래처', [채널] = \"매장\"))"],
    ["measure", "ALL · 전체 대비 비중", "매출 비중 = DIVIDE([총매출금액], CALCULATE([총매출금액], ALL(제품)))"],
    ["measure", "시간 · 전월 매출", "전월_매출 = CALCULATE([총매출금액], DATEADD('날짜'[날짜], -1, MONTH))", { rows: "날짜[연월]", cols: "" }],
    ["measure", "시간 · 연간 누계", "연간_누계 = TOTALYTD([총매출금액], '날짜'[날짜])", { rows: "날짜[월]", cols: "날짜[연도]" }],
    ["measure", "시간 · 전년 대비", "전년대비 증감률 =\nVAR 당월 = [총매출금액]\nVAR 전년 = CALCULATE([총매출금액], SAMEPERIODLASTYEAR('날짜'[날짜]))\nRETURN DIVIDE(당월 - 전년, 전년)", { rows: "날짜[월]", cols: "날짜[연도]", fmt: "0.0%" }],
    ["measure", "RANKX · 판매수량 순위", "순위 = RANKX(ALL('제품'[제품명]), [총수량], , DESC, Dense)", { rows: "제품[제품명]", cols: "" }],
    ["measure", "USERELATIONSHIP · 배송일 기준", "배송기준 매출 = CALCULATE([총매출금액], USERELATIONSHIP(판매[배송일], 날짜[날짜]))", { rows: "날짜[연월]", cols: "" }],
    ["measure", "SWITCH · 매출 등급", "등급 = SWITCH(TRUE(), [총매출금액] >= 30000000, \"A\", [총매출금액] >= 10000000, \"B\", \"C\")", { rows: "거래처[거래처명]", cols: "" }],
    ["measure", "ISINSCOPE · 계층별 다른 계산", "표시 = IF(ISINSCOPE(제품[분류명]), [총매출금액], [총수량])"],
    ["column", "계산 열 · 행별 이익 (판매)", "행이익 = 판매[매출금액] - 판매[수량] * RELATED(제품[원가])", { table: "판매" }],
    ["column", "계산 열 · 컨텍스트 전환 (제품)", "판매수량 = CALCULATE(SUM(판매[수량]))", { table: "제품" }],
    ["table", "새 테이블 · DimDate", "DimDate = ADDCOLUMNS(CALENDAR(DATE(2024,1,1), DATE(2024,3,31)), \"연도\", YEAR([Date]), \"월\", MONTH([Date]))"],
    ["table", "새 테이블 · 분류 요약", "분류요약 = SUMMARIZE(판매, 제품[분류명], \"수량\", [총수량], \"매출\", [총매출금액])"],
    ["table", "새 테이블 · TOP 5", "Top5 = TOPN(5, ADDCOLUMNS(VALUES(제품[제품명]), \"매출\", [총매출금액]), [매출], DESC)"],
  ];
  const MODE_HELP = {
    measure: "‘이름 = 식’ 형식으로 쓰면 측정값으로 저장할 수 있습니다. 결과는 아래 행렬의 행·열·슬라이서 필터 컨텍스트에서 셀마다 계산됩니다. 셀을 누르면 그 셀에 걸린 필터를 보여 줍니다.",
    column: "선택한 테이블의 행마다 식을 계산합니다(행 컨텍스트, 필터 없음). ‘모델에 열 추가’를 누르면 필드 목록에 생기고 행·슬라이서·측정값에서 쓸 수 있습니다.",
    table: "테이블을 돌려주는 식(CALENDAR, ADDCOLUMNS, SUMMARIZE, FILTER, TOPN …)의 결과를 보여 줍니다.",
  };
  let labEd;

  function initLab() {
    labEd = Editor($("#labEditor"), { onRun: runLab, placeholder: "예) 매출 비중 = DIVIDE([총매출금액], CALCULATE([총매출금액], ALL(제품)))", onChange: () => store.set("labCode:" + lab.mode, labEd.get()) });
    labEd.set(store.get("labCode:" + lab.mode, lab.mode === "measure" ? EXAMPLES[2][2] : lab.mode === "column" ? EXAMPLES[10][2] : EXAMPLES[12][2]));
    // 예제
    const ex = $("#exampleSel");
    ex.innerHTML = '<option value="">예제 불러오기…</option>' + EXAMPLES.map((e, i) => `<option value="${i}">${esc(e[1])}</option>`).join("");
    ex.addEventListener("change", () => {
      const e = EXAMPLES[+ex.value]; if (!e) return;
      setMode(e[0], true);
      if (e[3]) { Object.assign(lab, e[3]); if (e[3].table) $("#colTable").value = e[3].table; if (e[3].fmt) $("#fmtSel").value = e[3].fmt; else $("#fmtSel").value = "auto"; syncViz(); }
      labEd.set(e[2]); store.set("labCode:" + lab.mode, e[2]);
      ex.value = ""; runLab();
    });
    // 모드
    $$("#modeSeg button").forEach((b) => b.addEventListener("click", () => { setMode(b.dataset.mode); runLab(); }));
    // 테이블 선택 (계산 열)
    $("#colTable").innerHTML = [...model.tables.values()].map((t) => `<option>${esc(t.name)}</option>`).join("");
    $("#colTable").value = lab.table;
    $("#colTable").addEventListener("change", () => { lab.table = $("#colTable").value; saveLab(); runLab(); });
    // 서식
    $("#fmtSel").value = lab.fmt;
    $("#fmtSel").addEventListener("change", () => { lab.fmt = $("#fmtSel").value; saveLab(); runLab(); });
    // 축
    const opt = (sel) => AXES.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l || v)}</option>`).join("");
    $("#rowSel").innerHTML = opt(lab.rows); $("#colSel").innerHTML = opt(lab.cols);
    $("#rowSel").addEventListener("change", () => { lab.rows = $("#rowSel").value; saveLab(); runLab(); });
    $("#colSel").addEventListener("change", () => { lab.cols = $("#colSel").value; saveLab(); runLab(); });
    buildSlicers();
    $("#runBtn").addEventListener("click", runLab);
    $("#saveBtn").addEventListener("click", saveFromLab);
    $("#resetMs").addEventListener("click", () => {
      if (!confirm("내가 만든 측정값과 계산 열을 모두 지울까요? (기본 측정값은 남습니다)")) return;
      userMeasures.forEach((m) => model.removeMeasure(m.name)); userMeasures = []; store.set("measures", userMeasures);
      userCols.forEach((c) => model.removeColumn(c.table, c.name)); userCols = []; store.set("columns", userCols);
      renderFields(); renderMeasures(); runLab();
    });
    $("#labResult").addEventListener("click", onCellClick);
    setMode(lab.mode, true);
    renderFields(); renderMeasures();
  }
  function saveLab() { const { sel, ...rest } = lab; void sel; store.set("lab", rest); }
  function syncViz() {
    $("#rowSel").value = lab.rows || ""; $("#colSel").value = lab.cols || "";
    buildSlicers(); saveLab();
  }
  function setMode(m, keepCode) {
    if (!keepCode && labEd) store.set("labCode:" + lab.mode, labEd.get());
    const prev = lab.mode;
    lab.mode = m; saveLab();
    $$("#modeSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    $("#colTableWrap").hidden = m !== "column";
    $("#vizPanel").hidden = m !== "measure";
    $("#saveBtn").textContent = m === "measure" ? "측정값으로 저장" : m === "column" ? "모델에 열 추가" : "결과 확인용";
    $("#saveBtn").hidden = m === "table";
    $("#modeHelp").textContent = MODE_HELP[m];
    if (labEd && prev !== m && !keepCode) labEd.set(store.get("labCode:" + m, m === "measure" ? EXAMPLES[2][2] : m === "column" ? EXAMPLES[10][2] : EXAMPLES[12][2]));
  }
  function buildSlicers() {
    const box = $("#slicers");
    box.innerHTML = SLICERS.map(([key, label]) => {
      const ref = G.parseRef(model, key);
      const vals = G.axisValues(model, ref, new DAX.Ctx());
      const on = (lab.slicers[key] || []).map(DAX.keyOf);
      return `<div class="slicer" data-key="${esc(key)}"><span class="nm">${esc(label)}</span>${vals.map((v) => `<button type="button" class="chip" aria-pressed="${on.includes(DAX.keyOf(v))}" data-k="${esc(DAX.keyOf(v))}">${esc(lbl(v))}</button>`).join("")}</div>`;
    }).join("");
    const sum = Object.entries(lab.slicers).filter(([, v]) => v.length).map(([k, v]) => `${k.replace(/^.*\[|\]$/g, "")}=${v.map((x) => lbl(x)).join(",")}`);
    $("#slicerSum").textContent = sum.length ? "· " + sum.join(" · ") : "· 선택 없음(모두)";
    $$(".chip", box).forEach((b) => b.addEventListener("click", () => {
      const key = b.closest(".slicer").dataset.key, ref = G.parseRef(model, key);
      const vals = G.axisValues(model, ref, new DAX.Ctx());
      const v = vals.find((x) => DAX.keyOf(x) === b.dataset.k);
      const cur = lab.slicers[key] || [];
      const i = cur.findIndex((x) => DAX.keyOf(x) === b.dataset.k);
      lab.slicers[key] = i >= 0 ? cur.filter((_, j) => j !== i) : cur.concat([v]);
      if (!lab.slicers[key].length) delete lab.slicers[key];
      buildSlicers(); saveLab(); runLab();
    }));
  }
  // 슬라이서 값(날짜 등) JSON 저장 복원
  (function fixSlicerTypes() {
    for (const k of Object.keys(lab.slicers || {})) {
      try { const ref = G.parseRef(model, k); const vals = G.axisValues(model, ref, new DAX.Ctx()); lab.slicers[k] = lab.slicers[k].map((x) => vals.find((v) => String(v) === String(x)) ?? x); } catch (e) { delete lab.slicers[k]; }
    }
  })();

  function renderFields() {
    const tree = $("#fieldTree");
    const open = new Set($$("details[open]", tree).map((d) => d.dataset.t));
    if (!tree.children.length) open.add("판매");
    tree.innerHTML = [...model.tables.values()].map((t) => {
      const cols = t.columns.map((c) => {
        const calc = !BASECOLS.get(t.name) || !BASECOLS.get(t.name).has(c.name.toLowerCase());
        return `<li><button type="button" data-ins="${esc(qname(t.name) + "[" + c.name + "]")}"><span class="ic">${c.type === "date" ? "📅" : c.type === "text" ? "Aa" : "∑"}</span>${esc(c.name)}${calc ? ' <span class="calc">계산</span>' : ""}</button>${calc ? `<button type="button" class="peek" data-delcol="${esc(t.name)}|${esc(c.name)}" title="계산 열 삭제">✕</button>` : ""}</li>`;
      }).join("");
      const ms = [...model.measures.values()].filter((m) => m.table === t.name).map((m) => `<li class="ms"><button type="button" data-ins="${esc("[" + m.name + "]")}"><span class="ic">fx</span>${esc(m.name)}</button></li>`).join("");
      return `<details data-t="${esc(t.name)}" ${open.has(t.name) ? "open" : ""}><summary>${esc(t.name)} <button type="button" class="peek" data-peek="${esc(t.name)}">데이터</button><span class="cnt">${t.rows.length.toLocaleString()}행</span></summary><ul>${cols}${ms}</ul></details>`;
    }).join("");
    tree.onclick = (e) => {
      const p = e.target.closest("[data-peek]");
      if (p) { e.preventDefault(); peekTable(p.dataset.peek); return; }
      const d = e.target.closest("[data-delcol]");
      if (d) {
        const [t, c] = d.dataset.delcol.split("|");
        model.removeColumn(t, c); userCols = userCols.filter((x) => !(x.table === t && x.name === c)); store.set("columns", userCols);
        renderFields(); runLab(); return;
      }
      const b = e.target.closest("[data-ins]");
      if (b) labEd.insert(b.dataset.ins);
    };
  }
  function renderMeasures() {
    const ums = [...model.measures.values()];
    $("#msList").innerHTML = ums.map((m) => {
      const mine = !BUILTIN.has(m.name.toLowerCase());
      return `<div class="msitem"><span class="nm">${esc(m.name)}</span><span class="ex" title="${esc(m.expr)}">${esc(m.expr)}</span><button type="button" data-edit="${esc(m.name)}" title="편집기로 불러오기">✎</button>${mine ? `<button type="button" data-del="${esc(m.name)}" title="삭제">✕</button>` : ""}</div>`;
    }).join("");
    $("#msList").onclick = (e) => {
      const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (ed) { const m = model.measures.get(ed.dataset.edit.toLowerCase()); setMode("measure"); labEd.set(`${m.name} = ${m.expr}`); if (m.format) { $("#fmtSel").value = [...$("#fmtSel").options].some((o) => o.value === m.format) ? m.format : "auto"; lab.fmt = $("#fmtSel").value; } runLab(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (del) { model.removeMeasure(del.dataset.del); userMeasures = userMeasures.filter((x) => x.name !== del.dataset.del); store.set("measures", userMeasures); renderFields(); renderMeasures(); }
    };
  }
  function peekTable(name) {
    const t = model.table(name);
    const tv = model.baseTV(t.name);
    $("#labResult").innerHTML = `<div class="row" style="justify-content:space-between"><h3>${esc(t.name)} 테이블 미리 보기</h3><span class="small muted">${t.rows.length.toLocaleString()}행 중 처음 100행</span></div>` + tvHTML(tv, 100);
    $("#labResult").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function inferFormat(ast) {
    if (lab.fmt !== "auto") return lab.fmt;
    if (ast.type === "ref") { const m = model.measures.get(ast.name.toLowerCase()); if (m) return m.format; }
    return undefined;
  }
  function runLab() {
    const text = labEd.get();
    const out = $("#labResult");
    if (!text.trim()) { out.innerHTML = '<p class="muted">식을 입력하세요.</p>'; return; }
    const { name, expr, offset } = defParts(text);
    let ast;
    try { ast = DAX.parse(expr); }
    catch (e) { labEd.markError(e.pos !== undefined ? e.pos + offset : undefined); out.innerHTML = errorHTML(e, text, offset); return; }
    const t0 = performance.now();
    try {
      if (lab.mode === "measure") {
        const grid = G.computeGrid(model, engine, { rows: lab.rows, cols: lab.cols, slicers: lab.slicers }, ast);
        lab.lastGrid = grid; lab.lastAst = ast; lab.sel = null;
        let fmt = inferFormat(ast), fmtNote = "";
        if (fmt === undefined && lab.fmt === "auto") {
          const nums = [grid.grand].concat(...grid.cells, grid.rowTot, grid.colTot).filter((v) => typeof v === "number" && isFinite(v));
          const top = ast.type === "var" ? ast.body : ast;
          const ratio = (top.type === "call" && top.name === "DIVIDE") || (top.type === "bin" && top.op === "/");
          if (ratio && nums.length && nums.every((v) => Math.abs(v) <= 5) && nums.some((v) => !Number.isInteger(v))) { fmt = "0.0%"; fmtNote = " · 자동 서식: 비율(0.0%)"; }
        }
        const ms = (performance.now() - t0).toFixed(0);
        out.innerHTML = `<div class="row" style="justify-content:space-between;align-items:end">
            <div class="cardviz"><b>${esc(fmtV(grid.grand, fmt)) || "(빈 값)"}</b><span>${esc(name || "결과")} · 카드(총계)</span></div>
            <span class="small muted">${ms}ms${fmtNote} · 셀 ${grid.cells.flat().length + grid.rowTot.length + grid.colTot.length + 1}개 계산</span></div>
          ${grid.rRef || grid.cRef ? gridHTML(grid, fmt, { title: name || "값" }) : ""}
          <div class="ctxbox" id="ctxBox"><b>셀을 눌러 보세요.</b> 그 셀을 계산할 때 걸린 필터 컨텍스트와, 그 상태에서 보이는 판매 행 수를 보여 줍니다.</div>`;
      } else if (lab.mode === "column") {
        const vals = G.computeColumn(model, engine, lab.table, ast);
        const base = model.baseTV(model.table(lab.table).name);
        const nm = name || "새 열";
        const cols = base.cols.concat([{ name: nm, table: null, col: null }]);
        const tv = DAX.makeTV(cols, base.rows.slice(0, 60).map((r, i) => ({ vals: r.vals.concat([vals[i]]) })));
        const distinct = new Set(vals.map(DAX.keyOf)).size;
        out.innerHTML = `<div class="row" style="justify-content:space-between"><h3>${esc(lab.table)}[${esc(nm)}] 미리 보기</h3><span class="small muted">${vals.length.toLocaleString()}행 계산 · 고유 값 ${distinct}개 · 처음 60행 표시</span></div>` + tvHTML(tv, 60, cols.length - 1);
      } else {
        const tv = G.computeTable(model, engine, ast);
        out.innerHTML = `<div class="row" style="justify-content:space-between"><h3>${esc(name || "새 테이블")}</h3><span class="small muted">${tv.rows.length.toLocaleString()}행 × ${tv.cols.length}열${tv.rows.length > 200 ? " · 처음 200행 표시" : ""}</span></div>` + tvHTML(tv, 200);
      }
    } catch (e) {
      labEd.markError(e.pos !== undefined ? e.pos + offset : undefined);
      out.innerHTML = errorHTML(e, text, offset);
    }
  }
  function onCellClick(e) {
    const td = e.target.closest("td.cell");
    if (!td || !lab.lastGrid) return;
    $$("td.sel", $("#labResult")).forEach((x) => x.classList.remove("sel"));
    td.classList.add("sel");
    const g = lab.lastGrid;
    const rv = td.dataset.r ? g.rowVals.find((v) => DAX.keyOf(v) === td.dataset.r) : null;
    const cv = td.dataset.c ? g.colVals.find((v) => DAX.keyOf(v) === td.dataset.c) : null;
    const ctx = g.make(rv, cv, !!td.dataset.r, !!td.dataset.c);
    const items = [];
    Object.entries(lab.slicers).forEach(([k, v]) => v.length && items.push(`<li><code>${esc(k)}</code> ∈ {${esc(v.map((x) => lbl(x)).join(", "))}} <span class="muted">— 슬라이서</span></li>`));
    if (td.dataset.r) items.push(`<li><code>${esc(g.rRef.table)}[${esc(g.rRef.col)}]</code> = ${esc(lbl(rv))} <span class="muted">— 행 머리글</span></li>`);
    if (td.dataset.c) items.push(`<li><code>${esc(g.cRef.table)}[${esc(g.cRef.col)}]</code> = ${esc(lbl(cv))} <span class="muted">— 열 머리글</span></li>`);
    const n = model.visibleRows("판매", ctx).length;
    $("#ctxBox").innerHTML = `<b>이 셀의 필터 컨텍스트</b>${items.length ? `<ul>${items.join("")}</ul>` : '<p class="muted" style="margin-top:4px">필터 없음 — 전체 데이터에서 계산</p>'}<p style="margin-top:6px">→ 관계를 따라 <b>판매 ${n.toLocaleString()}행</b>이 보이는 상태에서 식을 계산했습니다. CALCULATE·ALL·시간 인텔리전스 함수는 이 컨텍스트를 식 안에서 다시 바꿉니다.</p>`;
  }
  function saveFromLab() {
    const text = labEd.get(), out = $("#labResult");
    const { name, expr, offset } = defParts(text);
    if (!name) { out.innerHTML = `<div class="err"><b>이름이 필요합니다.</b> ‘이름 = 식’ 형식으로 써 주세요. 예) <code>매출 비중 = DIVIDE(…)</code></div>`; return; }
    try {
      const ast = DAX.parse(expr);
      if (lab.mode === "measure") {
        if (BUILTIN.has(name.toLowerCase())) throw new DAX.DaxError(`[${name}]은(는) 기본 측정값 이름입니다. 다른 이름을 쓰세요.`);
        const prev = model.measures.get(name.toLowerCase());
        model.setMeasure(name, expr, lab.fmt === "auto" ? "" : lab.fmt, "_측정값");
        try { G.computeGrid(model, engine, { rows: lab.rows, cols: lab.cols, slicers: lab.slicers }, ast); }
        catch (e) { if (prev) model.measures.set(name.toLowerCase(), prev); else model.removeMeasure(name); throw e; }
        userMeasures = userMeasures.filter((m) => m.name.toLowerCase() !== name.toLowerCase()).concat([{ name, expr, format: lab.fmt === "auto" ? "" : lab.fmt }]);
        store.set("measures", userMeasures);
        renderFields(); renderMeasures(); runLab();
        out.insertAdjacentHTML("afterbegin", `<div class="ok">[${esc(name)}] 측정값을 저장했습니다. 다른 식에서 [${esc(name)}]로 쓸 수 있습니다.</div>`);
      } else if (lab.mode === "column") {
        const t = model.table(lab.table);
        if (BASECOLS.get(t.name).has(name.toLowerCase())) throw new DAX.DaxError(`${t.name} 테이블에 이미 [${name}] 열이 있습니다.`);
        const vals = G.computeColumn(model, engine, t.name, ast);
        model.addColumn(t.name, name, vals);
        userCols = userCols.filter((c) => !(c.table === t.name && c.name.toLowerCase() === name.toLowerCase())).concat([{ table: t.name, name, expr }]);
        store.set("columns", userCols);
        renderFields(); runLab();
        out.insertAdjacentHTML("afterbegin", `<div class="ok">${esc(t.name)}[${esc(name)}] 열을 모델에 추가했습니다. 행렬의 축으로 쓰려면 이 열을 측정값 식에서 활용하거나 필드 목록에서 확인하세요.</div>`);
      }
    } catch (e) { out.innerHTML = errorHTML(e, text, offset); }
  }

  // ───────── 연습문제 ─────────
  let stats = store.get("stats", {});
  (store.get("solved", []) || []).forEach((id) => { if (!stats[id]) stats[id] = { tries: 1, ok: true }; });
  let curP = null, pEd, openedAt = Date.now(), tick = null;
  let pFilter = store.get("pFilter", "all"), pQuery = "";
  let pset = store.get("pset", null);
  const st = (id) => stats[id] || (stats[id] = { tries: 0, ok: false, best: null, peek: false });
  const saveStats = () => store.set("stats", stats);
  const LV = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const examTag = (e) => `<span class="tag ${e === "문제1" ? "q1" : e === "문제2" ? "q2" : "q3"}">${e} 유형</span>`;
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const SET_LIMIT = 20 * 60;
  function visibleProblems() {
    const q = pQuery.trim().toLowerCase();
    return C.PROBLEMS.filter((p) => {
      const s = stats[p.id];
      if (pFilter === "todo" && s && s.ok) return false;
      if (pFilter === "wrong" && !(s && s.tries > 0 && !s.ok)) return false;
      if (pFilter === "peek" && !(s && s.peek)) return false;
      if (q && !(p.title + " " + p.name + " " + p.task + " " + p.answer + " " + p.cat).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderPList() {
    const solvedN = C.PROBLEMS.filter((p) => stats[p.id] && stats[p.id].ok).length;
    const pct = Math.round((solvedN / C.PROBLEMS.length) * 100);
    const vis = visibleProblems();
    const cats = [...new Set(C.PROBLEMS.map((p) => p.cat))];
    const f = (k, l) => `<button type="button" data-f="${k}" aria-pressed="${pFilter === k}">${l}</button>`;
    let h = `<div style="display:grid;gap:8px">
      <div class="row" style="justify-content:space-between"><b>DAX 연습문제</b><span class="small muted">${solvedN}/${C.PROBLEMS.length} 해결</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="row"><button class="btn sm primary" type="button" id="pSetBtn">⏱ 실전 세트 (6문제·20분)</button><button class="btn sm" type="button" id="pRand">🎲 랜덤</button></div>
      <div class="seg pf" role="group" aria-label="문제 필터">${f("all", "전체")}${f("todo", "미해결")}${f("wrong", "틀림")}${f("peek", "정답 봄")}</div>
      <input type="search" id="pSearch" placeholder="검색 (예: DATEADD, 비중)" value="${esc(pQuery)}" aria-label="문제 검색">
    </div>`;
    for (const c of cats) {
      const all = C.PROBLEMS.filter((p) => p.cat === c), items = vis.filter((p) => p.cat === c);
      if (!items.length) continue;
      const done = all.filter((p) => stats[p.id] && stats[p.id].ok).length;
      h += `<div><h4>${esc(c)} <span class="muted" style="font-weight:400">${done}/${all.length}</span></h4>${items.map((p) => {
        const s = stats[p.id] || {};
        const cls = s.ok ? "done" : s.tries ? "tried" : "";
        const mark = s.ok ? "✓" : s.tries ? "✕" : "";
        return `<button type="button" data-p="${p.id}" aria-current="${curP && curP.id === p.id}"><span class="st ${cls}">${mark}</span><span class="pt">${esc(p.title)}</span>${s.best ? `<span class="tm">${mmss(s.best)}</span>` : ""}<span class="lv">${LV(p.lv)}</span></button>`;
      }).join("")}</div>`;
    }
    if (!vis.length) h += `<p class="small muted">조건에 맞는 문제가 없습니다.</p>`;
    $("#pList").innerHTML = h;
    const si = $("#pSearch");
    si.oninput = () => { pQuery = si.value; const pos = si.selectionStart; renderPList(); const n = $("#pSearch"); n.focus(); n.setSelectionRange(pos, pos); };
  }
  function nextIdAfter(p) {
    if (pset && !pset.finished && pset.ids.includes(p.id)) {
      const rest = pset.ids.filter((id) => !(id in pset.done) && id !== p.id);
      return rest.length ? rest[0] : null;
    }
    const list = visibleProblems();
    const i = list.findIndex((x) => x.id === p.id);
    const after = list.slice(i + 1).concat(list.slice(0, Math.max(0, i)));
    const un = after.find((x) => !(stats[x.id] && stats[x.id].ok));
    return (un || after[0] || {}).id || null;
  }
  function setBanner() {
    if (!pset || pset.finished || !curP || !pset.ids.includes(curP.id)) return "";
    const left = SET_LIMIT - (Date.now() - pset.start) / 1000;
    return `<div class="setbar"><b>실전 세트</b><span class="dots">${pset.ids.map((id, i) => `<button type="button" data-sp="${id}" class="${id in pset.done ? "ok" : ""} ${id === curP.id ? "cur" : ""}" title="${i + 1}번">${i + 1}</button>`).join("")}</span><span class="mono" id="setLeft">${left > 0 ? "남은 시간 " + mmss(left) : "시간 초과 +" + mmss(-left)}</span><button class="btn sm" type="button" id="setEnd">세트 끝내기</button></div>`;
  }
  function startTick() {
    clearInterval(tick);
    tick = setInterval(() => {
      const t = $("#pTimer"); if (!t) { clearInterval(tick); return; }
      t.textContent = "⏱ " + mmss((Date.now() - openedAt) / 1000);
      const l = $("#setLeft");
      if (l && pset) { const left = SET_LIMIT - (Date.now() - pset.start) / 1000; l.textContent = left > 0 ? "남은 시간 " + mmss(left) : "시간 초과 +" + mmss(-left); l.classList.toggle("over", left <= 0); }
    }, 1000);
  }
  function openProblem(id, push) {
    const p = C.PROBLEMS.find((x) => x.id === id) || C.PROBLEMS[0];
    curP = p; openedAt = Date.now();
    store.set("lastP", p.id);
    if (push) history.replaceState(null, "", "#practice/" + p.id);
    renderPList();
    const setup = [];
    if (p.mode === "measure") {
      setup.push(`<span class="tag">측정값</span>`);
      if (p.rows) setup.push(`<span class="tag">행: ${esc(p.rows)}</span>`);
      if (p.cols) setup.push(`<span class="tag">열: ${esc(p.cols)}</span>`);
      Object.entries(p.slicers || {}).forEach(([k, v]) => setup.push(`<span class="tag">슬라이서: ${esc(k)} = ${esc(v.join(", "))}</span>`));
      if (p.format) setup.push(`<span class="tag">서식: ${esc(p.format)}</span>`);
    } else if (p.mode === "column") setup.push(`<span class="tag">계산 열</span><span class="tag">테이블: ${esc(p.table)}</span>`);
    else setup.push(`<span class="tag">새 테이블</span>`);
    const s = stats[p.id] || {};
    const inSet = pset && !pset.finished && pset.ids.includes(p.id);
    $("#pDetail").innerHTML = `${setBanner()}
      <div class="row" style="justify-content:space-between"><div class="row">${examTag(p.exam)}<span class="tag">${esc(p.cat)}</span><span class="tag" style="color:var(--hi)">${LV(p.lv)}</span></div>
        <div class="row"><span class="mono small muted" id="pTimer">⏱ 00:00</span>${inSet ? "" : '<button class="btn sm" id="pPrev" type="button">← 이전</button><button class="btn sm" id="pNext" type="button">다음 →</button>'}</div></div>
      <h2>${esc(p.title)}</h2>
      <p class="task">${esc(p.task)}</p>
      <div class="setup">${setup.join("")}</div>
      <p class="small muted">${s.ok ? `✓ 해결함${s.best ? " · 최고 기록 " + mmss(s.best) : ""}` : s.tries ? `시도 ${s.tries}회 · 아직 미해결` : "처음 푸는 문제"}${s.peek ? " · 정답 확인함" : ""}</p>
      <div id="pEditor"></div>
      <div class="toolbar"><button class="btn primary" id="pRun" type="button">채점 <kbd>Ctrl+Enter</kbd></button><button class="btn" id="pHint" type="button">힌트</button><button class="btn" id="pAns" type="button">정답 보기</button><button class="btn ghost" id="pClear" type="button">지우고 다시</button><button class="btn ghost" id="pLab" type="button">랩에서 열기</button></div>
      <div id="pHintBox" class="note" hidden>${esc(p.hint || "정답 보기 전에 함수 목록(패턴·함수 탭)을 참고해 보세요.")}</div>
      <div id="pOut"></div>
      <div id="pAnsBox" class="reveal" hidden><b>정답 예시</b><pre>${esc(p.name + " = " + p.answer)}</pre>${p.alt ? `<p class="small muted" style="margin-top:6px">다른 정답</p><pre>${esc(p.name + " = " + p.alt)}</pre>` : ""}${p.explain ? `<p style="margin-top:8px">${esc(p.explain)}</p>` : ""}</div>`;
    pEd = Editor($("#pEditor"), { onRun: gradeCur, minHeight: 90, placeholder: `${p.name} = `, onChange: () => store.set("code:" + p.id, pEd.get()) });
    pEd.set(store.get("code:" + p.id, `${p.name} = `));
    $("#pRun").onclick = gradeCur;
    $("#pHint").onclick = () => ($("#pHintBox").hidden = !$("#pHintBox").hidden);
    $("#pAns").onclick = () => {
      const box = $("#pAnsBox");
      if (box.hidden && !(stats[p.id] && stats[p.id].ok)) { st(p.id).peek = true; saveStats(); renderPList(); }
      box.hidden = !box.hidden;
    };
    $("#pClear").onclick = () => { pEd.set(`${p.name} = `); store.set("code:" + p.id, pEd.get()); openedAt = Date.now(); $("#pOut").innerHTML = ""; pEd.focus(); };
    $("#pLab").onclick = () => {
      setMode(p.mode, true);
      if (p.mode === "measure") { lab.rows = p.rows || ""; lab.cols = p.cols || ""; lab.slicers = JSON.parse(JSON.stringify(p.slicers || {})); lab.fmt = p.format && [...$("#fmtSel").options].some((o) => o.value === p.format) ? p.format : "auto"; $("#fmtSel").value = lab.fmt; syncViz(); }
      if (p.mode === "column") { lab.table = p.table; $("#colTable").value = p.table; }
      labEd.set(pEd.get().trim().replace(/=\s*$/, "") === p.name ? `${p.name} = ${p.answer}` : pEd.get());
      store.set("labCode:" + lab.mode, labEd.get());
      location.hash = "#lab"; setTimeout(runLab, 0);
    };
    if (!inSet) {
      const i = C.PROBLEMS.indexOf(p);
      $("#pPrev").disabled = i === 0; $("#pNext").disabled = i === C.PROBLEMS.length - 1;
      $("#pPrev").onclick = () => openProblem(C.PROBLEMS[i - 1].id, true);
      $("#pNext").onclick = () => openProblem(C.PROBLEMS[i + 1].id, true);
    }
    startTick();
    if (window.innerWidth < 860 && push) $("#pDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    else if (push) pEd.focus();
  }
  function gradeCur() {
    const p = curP, text = pEd.get(), out = $("#pOut");
    const { name, expr, offset } = defParts(text);
    if (!expr.trim() || (name && !expr.trim())) { out.innerHTML = '<div class="err">식을 입력하세요.</div>'; return; }
    const s = st(p.id);
    try {
      DAX.parse(expr);
      const r = G.grade(model, engine, p, expr);
      s.tries++;
      const nameNote = name && name.replace(/\s/g, "") !== p.name.replace(/\s/g, "") ? `<p class="small muted" style="margin-top:6px">※ 이름은 채점하지 않지만, 시험에서는 지시된 이름(<b>${esc(p.name)}</b>)과 정확히 같아야 합니다.</p>` : "";
      let html = "";
      if (r.ok) {
        const sec = Math.round((Date.now() - openedAt) / 1000);
        const first = !s.ok;
        s.ok = true; if (!s.best || sec < s.best) s.best = sec;
        if (pset && !pset.finished && pset.ids.includes(p.id) && !(p.id in pset.done)) { pset.done[p.id] = sec; store.set("pset", pset); }
        const nx = nextIdAfter(p);
        const setDone = pset && !pset.finished && pset.ids.includes(p.id) && pset.ids.every((id) => id in pset.done);
        html = `<div class="ok row" style="justify-content:space-between"><span>정답! ${r.total.toLocaleString()}개 ${p.mode === "measure" ? "셀" : "행"} 일치 · ${mmss(sec)}${first ? "" : s.best === sec ? " · 최고 기록 갱신" : ""}</span>${setDone ? '<button class="btn sm primary" type="button" id="pGoNext">세트 결과 보기 →</button>' : nx ? '<button class="btn sm primary" type="button" id="pGoNext">다음 문제 →</button>' : ""}</div>${nameNote}`;
        if (r.diffs.length) html += `<p class="small muted">참고: ${esc(r.diffs.map((d) => d.where + " — 기대 " + d.expected + " / 입력 " + d.got).join("; "))}</p>`;
        $("#pAnsBox").hidden = false;
        saveStats(); renderPList();
        if (pset && pset.ids.includes(p.id)) { const sb = $(".setbar"); if (sb) sb.outerHTML = setBanner(); }
        out.innerHTML = html + measurePreview(p, expr, name);
        const g = $("#pGoNext");
        if (g) { g.onclick = () => (setDone ? finishSet() : openProblem(nx, true)); g.focus(); }
        return;
      }
      html = `<div class="err"><b>아직 달라요.</b> ${r.total.toLocaleString()}개 중 ${r.diffs.filter((d) => !d.soft).length.toLocaleString()}곳이 정답과 다릅니다.</div>${nameNote}`;
      html += `<div class="tblwrap" style="max-height:260px"><table class="mx diffs"><thead><tr><th>위치</th><th>정답</th><th>내 결과</th></tr></thead><tbody>${r.diffs.slice(0, 15).map((d) => `<tr><td>${esc(d.where)}</td><td class="e">${esc(d.expected) || "(빈 값)"}</td><td class="g">${esc(d.got) || "(빈 값)"}</td></tr>`).join("")}</tbody></table></div>`;
      saveStats(); renderPList();
      out.innerHTML = html + measurePreview(p, expr, name);
    } catch (e) {
      pEd.markError(e.pos !== undefined ? e.pos + offset : undefined);
      out.innerHTML = errorHTML(e, text, offset);
    }
  }
  function measurePreview(p, expr, name) {
    if (p.mode !== "measure") return "";
    try {
      const grid = G.computeGrid(model, engine, { rows: p.rows, cols: p.cols, slicers: p.slicers }, DAX.parse(expr));
      return `<p class="small muted" style="margin-top:10px">내 식의 결과 (행렬)</p>` + gridHTML(grid, p.format || undefined, { title: name || p.name });
    } catch (e) { return ""; }
  }
  // 실전 세트
  function pickSet() {
    const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const prefer = (arr) => { const un = arr.filter((p) => !(stats[p.id] && stats[p.id].ok)); return un.length ? un : arr; };
    const used = new Set(), ids = [];
    const take = (pred) => { const pool = prefer(C.PROBLEMS.filter((p) => pred(p) && !used.has(p.id))); if (!pool.length) return; const p = rnd(pool); used.add(p.id); ids.push(p.id); };
    take((p) => p.mode !== "measure" && p.exam === "문제1");
    take((p) => p.cat === "CALCULATE 필터" && p.lv >= 2);
    take((p) => p.cat === "ALL·비중");
    take((p) => p.cat === "시간 인텔리전스" && p.lv >= 2);
    take((p) => p.cat === "순위·TOP N");
    take((p) => ["시간 인텔리전스", "복합", "반복 함수", "논리·텍스트"].includes(p.cat) && p.lv >= 2);
    return ids;
  }
  function startSet() {
    if (pset && !pset.finished && !confirm("진행 중인 세트를 버리고 새로 시작할까요?")) return;
    pset = { ids: pickSet(), start: Date.now(), done: {}, finished: false };
    pset.ids.forEach((id) => store.set("code:" + id, `${C.PROBLEMS.find((p) => p.id === id).name} = `));
    store.set("pset", pset);
    openProblem(pset.ids[0], true);
  }
  function finishSet() {
    if (!pset) return;
    pset.finished = true; pset.end = pset.end || Date.now(); store.set("pset", pset);
    const total = Math.round((pset.end - pset.start) / 1000);
    const n = Object.keys(pset.done).length;
    const hist = store.get("setHist", []);
    if (!pset.logged) { hist.unshift({ at: pset.start, n, of: pset.ids.length, sec: total }); store.set("setHist", hist.slice(0, 20)); pset.logged = true; store.set("pset", pset); }
    clearInterval(tick);
    $("#pDetail").innerHTML = `<h2>실전 세트 결과</h2>
      <div class="facts"><div><b>${n} / ${pset.ids.length}</b><span>정답</span></div><div><b>${mmss(total)}</b><span>걸린 시간 (목표 20:00)</span></div><div><b>${n ? mmss(Object.values(pset.done).reduce((a, b) => a + b, 0) / n) : "-"}</b><span>정답 문제 평균</span></div></div>
      <div class="tblwrap"><table class="mx"><thead><tr><th>문제</th><th>분류</th><th>결과</th></tr></thead><tbody>${pset.ids.map((id) => { const p = C.PROBLEMS.find((x) => x.id === id); return `<tr><td><button type="button" class="btn sm ghost" data-p2="${id}">${esc(p.title)}</button></td><td style="text-align:left">${esc(p.cat)}</td><td>${id in pset.done ? "✓ " + mmss(pset.done[id]) : "✕ 미해결"}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="row"><button class="btn primary" type="button" id="setAgain">새 세트 시작</button>${n < pset.ids.length ? '<button class="btn" type="button" id="setRetry">못 푼 문제 다시 풀기</button>' : ""}</div>
      ${hist.length > 1 ? `<div><p class="small muted">최근 세트 기록</p><p class="small mono">${hist.slice(0, 8).map((h) => `${new Date(h.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} ${h.n}/${h.of} ${mmss(h.sec)}`).join(" · ")}</p></div>` : ""}`;
    $("#setAgain").onclick = startSet;
    const rt = $("#setRetry"); if (rt) rt.onclick = () => { const id = pset.ids.find((x) => !(x in pset.done)); openProblem(id, true); };
    $("#pDetail").onclick = (e) => { const b = e.target.closest("[data-p2]"); if (b) openProblem(b.dataset.p2, true); };
    renderPList();
  }
  function initPractice() {
    $("#pList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-p]"); if (b) { openProblem(b.dataset.p, true); return; }
      const f = e.target.closest("[data-f]"); if (f) { pFilter = f.dataset.f; store.set("pFilter", pFilter); renderPList(); return; }
      if (e.target.closest("#pRand")) { const list = visibleProblems().filter((p) => p.id !== (curP && curP.id)); const un = list.filter((p) => !(stats[p.id] && stats[p.id].ok)); const pool = un.length ? un : list; if (pool.length) openProblem(pool[Math.floor(Math.random() * pool.length)].id, true); return; }
      if (e.target.closest("#pSetBtn")) startSet();
    });
    $("#pDetail").addEventListener("click", (e) => {
      const sp = e.target.closest("[data-sp]"); if (sp) { openProblem(sp.dataset.sp, true); return; }
      if (e.target.closest("#setEnd")) { if (confirm("세트를 끝내고 결과를 볼까요?")) finishSet(); }
    });
  }

  // ───────── 패턴·함수 ─────────
  function renderPatterns() {
    $("#patList").innerHTML = C.PATTERNS.map((p, i) => `<div class="pat"><div class="row" style="justify-content:space-between"><b>${esc(p.t)}</b><button class="btn sm" type="button" data-pat="${i}">랩에서 열기</button></div><pre>${highlight(p.c)}</pre><p class="small muted">${esc(p.n)}</p></div>`).join("");
    $("#patList").onclick = (e) => {
      const b = e.target.closest("[data-pat]"); if (!b) return;
      const p = C.PATTERNS[+b.dataset.pat];
      const blocks = [];
      p.c.split("\n").forEach((l) => {
        if (blocks.length && (/^\s/.test(l) || /^(VAR|RETURN)\b/.test(l) || !/^[^\s(]+[^=(]*=/.test(l))) blocks[blocks.length - 1] += "\n" + l;
        else blocks.push(l);
      });
      const code = blocks[0];
      const isTable = /ADDCOLUMNS\(\s*\n?\s*CALENDAR/.test(p.c);
      setMode(isTable ? "table" : "measure", true);
      if (/DATEADD|SAMEPERIODLASTYEAR|TOTALYTD/.test(code)) { lab.rows = "날짜[월]"; lab.cols = "날짜[연도]"; syncViz(); }
      if (/RANKX/.test(code)) { lab.rows = "제품[제품명]"; lab.cols = ""; syncViz(); }
      labEd.set(code); store.set("labCode:" + lab.mode, code);
      location.hash = "#lab"; setTimeout(runLab, 0);
    };
    const cats = ["전체", ...new Set(FN_LIST.map((f) => f.cat))];
    let cat = "전체";
    const draw = () => {
      const q = $("#fnSearch").value.trim().toLowerCase();
      const list = FN_LIST.filter((f) => (cat === "전체" || f.cat === cat) && (!q || f.name.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
      $("#fnList").innerHTML = list.map((f) => `<button type="button" class="fn" data-fn="${esc(f.name)}"><b>${esc(f.name)}</b><code>${esc(f.sig)}</code><span>${esc(f.desc)}</span></button>`).join("") || '<p class="muted">검색 결과가 없습니다.</p>';
      $("#fnCats").innerHTML = cats.map((c) => `<button type="button" class="chip" aria-pressed="${c === cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    };
    $("#fnSearch").addEventListener("input", draw);
    $("#fnCats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; draw(); } });
    $("#fnList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-fn]"); if (!b) return;
      location.hash = "#lab";
      setTimeout(() => { labEd.insert(b.dataset.fn + "("); }, 30);
    });
    draw();
  }

  // ───────── 퀴즈 ─────────
  function renderQuiz() {
    const ans = store.get("quiz", {});
    const right = Object.entries(ans).filter(([i, a]) => C.QUIZ[+i] && C.QUIZ[+i].a === a).length;
    $("#qScore").textContent = `${right} / ${C.QUIZ.length}  (응답 ${Object.keys(ans).length})`;
    $("#quizList").innerHTML = C.QUIZ.map((q, i) => {
      const a = ans[i];
      return `<div class="panel qz"><b>Q${i + 1}. ${esc(q.q)}</b><div class="opts">${q.o.map((o, j) => `<button type="button" data-q="${i}" data-o="${j}" class="${a === undefined ? "" : j === q.a ? "right" : j === a ? "wrong" : ""}" ${a !== undefined ? "disabled" : ""}>${String.fromCharCode(9312 + j)} ${esc(o)}</button>`).join("")}</div>${a !== undefined ? `<p class="why">${a === q.a ? "✅ 정답 · " : "❌ 오답 · "}${esc(q.e)}</p>` : ""}</div>`;
    }).join("");
  }
  function initQuiz() {
    $("#quizList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]"); if (!b) return;
      const ans = store.get("quiz", {}); ans[b.dataset.q] = +b.dataset.o; store.set("quiz", ans); renderQuiz();
    });
    $("#qReset").addEventListener("click", () => { store.set("quiz", {}); renderQuiz(); });
  }

  // ───────── 홈: 모델 카드 ─────────
  function renderModel() {
    $("#modelCards").innerHTML = [...model.tables.values()].map((t) => {
      const keys = new Set(model.rels.flatMap((r) => [r.from, r.to]).filter((c) => c.table === t.name).map((c) => c.col));
      return `<div class="panel tight" style="box-shadow:none"><div class="row" style="justify-content:space-between"><b>${esc(t.name)}</b><span class="tag">${t.name === "판매" ? "사실(Fact)" : "차원(Dim)"} · ${t.rows.length.toLocaleString()}행</span></div><p class="small muted" style="margin-top:4px">${t.columns.map((c) => (keys.has(c.name) ? `<b style="color:var(--ink)">${esc(c.name)}</b>` : esc(c.name))).join(" · ")}</p></div>`;
    }).join("");
    $("#relTable").innerHTML = "<thead><tr><th>시작(다 *)</th><th></th><th>끝(1)</th><th>상태</th></tr></thead><tbody>" + model.rels.map((r) => `<tr><td><code>${esc(r.from.table)}[${esc(r.from.col)}]</code></td><td style="text-align:center">*  →  1</td><td><code>${esc(r.to.table)}[${esc(r.to.col)}]</code></td><td>${r.active ? "활성 · 단일 방향" : "<b>비활성</b> (USERELATIONSHIP)"}</td></tr>`).join("") + "</tbody>";
  }

  // ───────── 라우팅·테마 ─────────
  const VIEWS = ["home", "lab", "practice", "patterns", "quiz"];
  let inited = {};
  function route() {
    const h = location.hash.replace(/^#/, "");
    const [v, arg] = h.split("/");
    const view = VIEWS.includes(v) ? v : "home";
    VIEWS.forEach((x) => ($("#v-" + x).hidden = x !== view));
    $$("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + view ? "page" : "false"));
    document.title = { home: "경영정보시각화 실기 랩", lab: "DAX 랩 · 경영정보시각화 실기 랩", practice: "연습문제 · 경영정보시각화 실기 랩", patterns: "DAX 패턴 · 경영정보시각화 실기 랩", quiz: "퀴즈 · 경영정보시각화 실기 랩" }[view];
    if (view === "lab" && !inited.lab) { inited.lab = 1; initLab(); runLab(); }
    if (view === "practice") { if (!inited.practice) { inited.practice = 1; initPractice(); } if (!curP || (arg && arg !== curP.id)) openProblem(arg || store.get("lastP", C.PROBLEMS[0].id)); else renderPList(); store.set("lastP", curP.id); }
    if (view === "patterns" && !inited.patterns) { inited.patterns = 1; renderPatterns(); }
    if (view === "quiz" && !inited.quiz) { inited.quiz = 1; initQuiz(); renderQuiz(); }
    if (view !== "lab") window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  const THEMES = ["auto", "light", "dark"];
  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
    $("#themeBtn").textContent = "테마: " + { auto: "자동", light: "밝게", dark: "어둡게" }[t];
  }
  let theme = store.get("theme", "auto"); applyTheme(theme);
  $("#themeBtn").addEventListener("click", () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set("theme", theme); applyTheme(theme); });

  // 랩이 아닌 화면에서 랩으로 넘길 때 초기화 보장
  const _setMode = setMode;
  setMode = function (m, k) { if (!inited.lab) { inited.lab = 1; initLab(); } return _setMode(m, k); };

  renderModel();
  route();
})();
