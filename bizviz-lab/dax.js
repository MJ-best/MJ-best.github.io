/* 미니 DAX 엔진 — 브라우저에서 DAX 식을 파싱하고 필터 컨텍스트 위에서 계산합니다.
   지원: 측정값/계산 열/계산 테이블, 필터 컨텍스트·행 컨텍스트·컨텍스트 전환, CALCULATE 필터 인수와
   ALL·ALLEXCEPT·ALLSELECTED·REMOVEFILTERS·KEEPFILTERS·USERELATIONSHIP, 시간 인텔리전스, 반복 함수 등.
   Power BI와 100% 같지는 않습니다(확장 테이블·양방향 필터 등 일부 단순화). */
(function (global) {
  "use strict";

  class DaxError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; this.isDax = true; }
  }
  const L = (s) => String(s).toLowerCase();
  const isBlank = (v) => v === null || v === undefined;
  const isDate = (v) => v instanceof Date;
  const isTable = (v) => v && v.isTable === true;
  const DAY = 86400000;

  function keyOf(v) {
    if (isBlank(v)) return "∅";
    if (isDate(v)) return "d" + v.getTime();
    if (typeof v === "number") return "n" + v;
    if (typeof v === "boolean") return "b" + v;
    return "s" + L(v);
  }

  // ───────────────────────── 렉서 ─────────────────────────
  function lex(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    const idStart = /[\p{L}_]/u, idPart = /[\p{L}\p{N}_.]/u;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((c === "/" && src[i + 1] === "/") || (c === "-" && src[i + 1] === "-")) { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      const start = i;
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        toks.push({ t: "num", v: parseFloat(m[0]), pos: start }); i += m[0].length; continue;
      }
      if (c === '"' || c === "“" || c === "”") {
        let s = ""; i++;
        for (;;) {
          if (i >= n) throw new DaxError('문자열을 여는 큰따옴표(")가 닫히지 않았습니다.', start);
          if (src[i] === '"' || src[i] === "”" || src[i] === "“") { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        toks.push({ t: "str", v: s, pos: start }); continue;
      }
      if (c === "'" || c === "‘" || c === "’") {
        let s = ""; i++;
        for (;;) {
          if (i >= n) throw new DaxError("테이블 이름을 감싸는 작은따옴표(')가 닫히지 않았습니다.", start);
          if (src[i] === "'" || src[i] === "’" || src[i] === "‘") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        toks.push({ t: "qid", v: s.trim(), pos: start }); continue;
      }
      if (c === "[") {
        let s = ""; i++;
        for (;;) {
          if (i >= n) throw new DaxError("대괄호([)가 닫히지 않았습니다.", start);
          if (src[i] === "]") { if (src[i + 1] === "]") { s += "]"; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        toks.push({ t: "br", v: s.trim(), pos: start }); continue;
      }
      if (idStart.test(c)) {
        let s = "";
        while (i < n && idPart.test(src[i])) s += src[i++];
        toks.push({ t: "id", v: s, pos: start }); continue;
      }
      const two = src.substr(i, 2);
      if (["<=", ">=", "<>", "==", "&&", "||"].includes(two)) { toks.push({ t: "op", v: two, pos: start }); i += 2; continue; }
      if ("+-*/^&=<>(),{};".includes(c)) { toks.push({ t: "op", v: c === ";" ? "," : c, pos: start }); i++; continue; }
      throw new DaxError(`알 수 없는 문자 '${c}'가 있습니다.`, start);
    }
    toks.push({ t: "eof", pos: n });
    return toks;
  }

  // ───────────────────────── 파서 ─────────────────────────
  function parse(src) {
    const toks = lex(src);
    let p = 0;
    const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
    const next = () => toks[p++];
    const isOp = (v, k = 0) => peek(k).t === "op" && peek(k).v === v;
    const isKw = (v) => peek().t === "id" && peek().v.toUpperCase() === v;
    const desc = (t) => t.t === "eof" ? "식의 끝" : t.t === "str" ? `"${t.v}"` : t.t === "br" ? `[${t.v}]` : t.t === "qid" ? `'${t.v}'` : `'${t.v}'`;
    function expect(v) {
      if (!isOp(v)) throw new DaxError(`${desc(peek())} 앞에 '${v}'가 필요합니다.`, peek().pos);
      return next();
    }
    function parseExpr() {
      if (isKw("VAR")) {
        const pos = peek().pos, vars = [];
        while (isKw("VAR")) {
          next();
          const nt = next();
          if (nt.t !== "id") throw new DaxError("VAR 다음에는 변수 이름이 와야 합니다.", nt.pos);
          expect("=");
          vars.push({ name: nt.v, expr: parseExpr() });
        }
        if (!isKw("RETURN")) throw new DaxError("VAR 블록 뒤에는 RETURN이 필요합니다.", peek().pos);
        next();
        return { type: "var", vars, body: parseExpr(), pos };
      }
      return parseOr();
    }
    function bin(sub, ops) {
      return function () {
        let left = sub();
        while (peek().t === "op" && ops.includes(peek().v)) {
          const t = next();
          left = { type: "bin", op: t.v, left, right: sub(), pos: t.pos };
        }
        return left;
      };
    }
    const parsePow = bin(parseUnary, ["^"]);
    const parseMul = bin(parsePow, ["*", "/"]);
    const parseAdd = bin(parseMul, ["+", "-"]);
    const parseCat = bin(parseAdd, ["&"]);
    function parseCmp() {
      let left = parseCat();
      for (;;) {
        if (peek().t === "op" && ["=", "==", "<>", "<", ">", "<=", ">="].includes(peek().v)) {
          const t = next();
          left = { type: "bin", op: t.v, left, right: parseCat(), pos: t.pos };
        } else if (isKw("IN")) {
          const t = next();
          left = { type: "in", left, right: parseCat(), pos: t.pos };
        } else if (isKw("NOT") && peek(1).t === "id" && peek(1).v.toUpperCase() === "IN") {
          const t = next(); next();
          left = { type: "unary", op: "NOT", arg: { type: "in", left, right: parseCat(), pos: t.pos }, pos: t.pos };
        } else break;
      }
      return left;
    }
    function parseNot() {
      if (isKw("NOT") && !isOp("(", 1)) { const t = next(); return { type: "unary", op: "NOT", arg: parseNot(), pos: t.pos }; }
      return parseCmp();
    }
    const parseAnd = bin(parseNot, ["&&"]);
    const parseOr = bin(parseAnd, ["||"]);
    function parseUnary() {
      if (isOp("-") || isOp("+")) { const t = next(); return { type: "unary", op: t.v, arg: parseUnary(), pos: t.pos }; }
      return parsePrimary();
    }
    function parsePrimary() {
      const t = peek();
      if (t.t === "num") { next(); return { type: "lit", v: t.v, pos: t.pos }; }
      if (t.t === "str") { next(); return { type: "lit", v: t.v, pos: t.pos }; }
      if (t.t === "op" && t.v === "(") {
        next(); const e = parseExpr(); expect(")"); return e;
      }
      if (t.t === "op" && t.v === "{") {
        next();
        const rows = [];
        if (!isOp("}")) {
          do {
            if (isOp("(")) {
              const save = p; next();
              const items = [parseExpr()];
              while (isOp(",")) { next(); items.push(parseExpr()); }
              if (isOp(")") && items.length > 1) { next(); rows.push(items); continue; }
              p = save; rows.push([parseExpr()]);
            } else rows.push([parseExpr()]);
          } while (isOp(",") && next());
        }
        expect("}");
        return { type: "tc", rows, pos: t.pos };
      }
      if (t.t === "qid") {
        next();
        if (peek().t === "br") { const c = next(); return { type: "col", table: t.v, col: c.v, pos: t.pos }; }
        return { type: "tref", name: t.v, pos: t.pos };
      }
      if (t.t === "br") { next(); return { type: "ref", name: t.v, pos: t.pos }; }
      if (t.t === "id") {
        next();
        const up = t.v.toUpperCase();
        if (isOp("(")) {
          next();
          const args = [];
          if (!isOp(")")) {
            for (;;) {
              if (isOp(",") || isOp(")")) args.push({ type: "empty", pos: peek().pos });
              else args.push(parseExpr());
              if (isOp(",")) { next(); continue; }
              break;
            }
          }
          if (!isOp(")")) throw new DaxError(`${up}( ... 의 괄호가 닫히지 않았거나 인수 사이에 쉼표가 빠졌습니다. (${desc(peek())} 근처)`, peek().pos);
          next();
          return { type: "call", name: up, args, pos: t.pos };
        }
        if (peek().t === "br") { const c = next(); return { type: "col", table: t.v, col: c.v, pos: t.pos }; }
        if (up === "TRUE") return { type: "lit", v: true, pos: t.pos };
        if (up === "FALSE") return { type: "lit", v: false, pos: t.pos };
        return { type: "name", name: t.v, pos: t.pos };
      }
      throw new DaxError(`${desc(t)}에서 식이 예상과 다릅니다.`, t.pos);
    }
    const ast = parseExpr();
    if (peek().t !== "eof") throw new DaxError(`${desc(peek())} 부분을 해석할 수 없습니다. 쉼표나 괄호, 연산자가 빠지지 않았는지 확인하세요.`, peek().pos);
    return ast;
  }

  // ───────────────────────── 테이블 값 ─────────────────────────
  // tv = { isTable, cols:[{name, table, col}], rows:[{vals:[], rid}], base }
  function makeTV(cols, rows, base) {
    const tv = { isTable: true, cols, rows, base: base || null };
    tv.idx = new Map();
    cols.forEach((c, i) => {
      if (c.table) { const k = L(c.table) + "[" + L(c.col) + "]"; if (!tv.idx.has(k)) tv.idx.set(k, i); }
      const nk = "#" + L(c.name); if (!tv.idx.has(nk)) tv.idx.set(nk, i);
    });
    return tv;
  }
  function tupleKey(vals) { return vals.map(keyOf).join("\u0001"); }

  // ───────────────────────── 날짜 도우미 ─────────────────────────
  const ymd = (d) => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  const mk = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  function addMonths(d, n) {
    const [y, m, dd] = ymd(d);
    const t = (y * 12 + (m - 1)) + n, ny = Math.floor(t / 12), nm = (t % 12 + 12) % 12 + 1;
    return mk(ny, nm, Math.min(dd, lastDay(ny, nm)));
  }
  const serial = (d) => d.getTime() / DAY + 25569;
  const fromSerial = (s) => new Date(Math.round((s - 25569) * DAY));

  // ───────────────────────── 포맷 ─────────────────────────
  const KDOW = ["일", "월", "화", "수", "목", "금", "토"];
  function fmtNumber(v, fmt) {
    const named = { "percent": "0.00%", "fixed": "0.00", "standard": "#,##0.00", "general number": "", "currency": "₩#,##0" };
    if (fmt && named[L(fmt)] !== undefined) fmt = named[L(fmt)];
    if (!fmt) return autoNum(v);
    const sections = splitSections(fmt);
    let f = sections[0];
    if (v < 0 && sections[1] !== undefined) { f = sections[1]; v = -v; }
    else if (v === 0 && sections[2] !== undefined) f = sections[2];
    // 리터럴 보호
    const lits = [];
    f = f.replace(/"([^"]*)"|\\(.)/g, (m, a, b) => { lits.push(a !== undefined ? a : b); return "\u0002" + (lits.length - 1) + "\u0003"; });
    const m = /[#0,.]*[#0][#0,.]*/.exec(f);
    if (!m) return f.replace(/\u0002(\d+)\u0003/g, (x, i) => lits[i]);
    let pat = m[0];
    let scale = 0;
    while (/,$/.test(pat)) { scale++; pat = pat.slice(0, -1); }
    const pct = (f.match(/%/g) || []).length;
    let x = v * Math.pow(100, pct) / Math.pow(1000, scale);
    const dot = pat.indexOf(".");
    const dec = dot < 0 ? "" : pat.slice(dot + 1);
    const minDec = (dec.match(/0/g) || []).length, maxDec = dec.replace(/,/g, "").length;
    const intPat = dot < 0 ? pat : pat.slice(0, dot);
    const group = intPat.includes(",");
    const minInt = (intPat.match(/0/g) || []).length;
    const neg = x < 0; x = Math.abs(x);
    let s = x.toFixed(maxDec);
    let [ip, fp = ""] = s.split(".");
    while (fp.length > minDec && fp.endsWith("0")) fp = fp.slice(0, -1);
    if (ip === "0" && minInt === 0) ip = "";
    while (ip.length < minInt) ip = "0" + ip;
    if (group) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    let num = ip + (fp ? "." + fp : "");
    if (num === "") num = "0";
    const out = f.slice(0, m.index) + num + f.slice(m.index + m[0].length);
    return (neg && sections[1] === undefined ? "-" : "") + out.replace(/\u0002(\d+)\u0003/g, (a, i) => lits[i]);
  }
  function splitSections(f) {
    const out = []; let cur = "", q = false;
    for (const ch of f) { if (ch === '"') q = !q; if (ch === ";" && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out;
  }
  function autoNum(v) {
    if (!isFinite(v)) return isNaN(v) ? "NaN" : (v > 0 ? "∞" : "-∞");
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    const a = Math.abs(v);
    const d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
    return Number(v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
  }
  function fmtDate(d, fmt) {
    if (!fmt) { const [y, m, dd] = ymd(d); return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; }
    const named = { "short date": "yyyy-mm-dd", "long date": "yyyy년 m월 d일 dddd", "general date": "yyyy-mm-dd" };
    if (named[L(fmt)]) fmt = named[L(fmt)];
    const [y, m, dd] = ymd(d), w = d.getUTCDay();
    return fmt.replace(/"([^"]*)"|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|q|aaa/gi, (tk, lit) => {
      if (lit !== undefined) return lit;
      switch (tk.toLowerCase()) {
        case "yyyy": return String(y);
        case "yy": return String(y).slice(2);
        case "mmmm": case "mmm": return m + "월";
        case "mm": return String(m).padStart(2, "0");
        case "m": return String(m);
        case "dddd": return KDOW[w] + "요일";
        case "ddd": case "aaa": return KDOW[w];
        case "dd": return String(dd).padStart(2, "0");
        case "d": return String(dd);
        case "q": return String(Math.ceil(m / 3));
      }
      return tk;
    });
  }
  function formatValue(v, fmt) {
    if (isBlank(v)) return "";
    if (isDate(v)) return fmtDate(v, fmt);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return fmtNumber(v, fmt);
    return String(v);
  }

  // ───────────────────────── 모델 ─────────────────────────
  class Model {
    constructor(def) {
      this.tables = new Map();
      this.rels = [];
      this.measures = new Map();
      this._reach = new Map();
      this._baseTV = new Map();
      this._arr = new Map();
      (def.tables || []).forEach((t) => this.addTable(t));
      (def.relationships || []).forEach((r) => this.addRelationship(r));
      (def.measures || []).forEach((m) => this.setMeasure(m.name, m.expr, m.format, m.table));
    }
    addTable(t) {
      const tbl = { name: t.name, columns: t.columns.map((c) => ({ ...c })), rows: t.rows, dateColumn: t.dateColumn || null, calc: !!t.calc };
      tbl.colMap = new Map(tbl.columns.map((c) => [L(c.name), c]));
      this.tables.set(L(t.name), tbl);
      this._invalidate();
      return tbl;
    }
    removeTable(name) { this.tables.delete(L(name)); this.rels = this.rels.filter((r) => L(r.from.table) !== L(name) && L(r.to.table) !== L(name)); this._invalidate(); }
    addColumn(tableName, colName, values, type) {
      const t = this.table(tableName);
      if (!t.colMap.has(L(colName))) { const c = { name: colName, type: type || guessType(values), calc: true }; t.columns.push(c); t.colMap.set(L(colName), c); }
      const canon = t.colMap.get(L(colName)).name;
      t.rows.forEach((r, i) => (r[canon] = values[i]));
      this._invalidate();
    }
    removeColumn(tableName, colName) {
      const t = this.table(tableName), c = t.colMap.get(L(colName));
      if (!c) return;
      t.columns = t.columns.filter((x) => x !== c); t.colMap.delete(L(colName));
      t.rows.forEach((r) => delete r[c.name]);
      this._invalidate();
    }
    addRelationship(r) {
      const from = this.column(r.from[0], r.from[1]), to = this.column(r.to[0], r.to[1]);
      this.rels.push({ id: this.rels.length, from, to, active: r.active !== false });
      this._invalidate();
    }
    _invalidate() { this._arr = new Map(); this._reach.clear(); this._baseTV.clear(); this.rels.forEach((r) => (r._idx = null)); this._uid = (this._uid || 0) + 1; }
    table(name) {
      const t = this.tables.get(L(name));
      if (!t) {
        const names = [...this.tables.values()].map((x) => x.name);
        throw new DaxError(`'${name}' 테이블을 찾을 수 없습니다. 모델의 테이블: ${names.join(", ")}`);
      }
      return t;
    }
    hasTable(name) { return this.tables.has(L(name)); }
    column(tname, cname) {
      const t = this.table(tname), c = t.colMap.get(L(cname));
      if (!c) throw new DaxError(`'${t.name}' 테이블에 [${cname}] 열이 없습니다. 열 목록: ${t.columns.map((x) => x.name).join(", ")}`);
      return { table: t.name, col: c.name, key: L(t.name) + "[" + L(c.name) + "]" };
    }
    setMeasure(name, expr, format, table) {
      const ast = parse(expr);
      this.measures.set(L(name), { name, expr, ast, format: format || "", table: table || "_측정값" });
    }
    removeMeasure(name) { this.measures.delete(L(name)); }
    relIndex(r) {
      if (r._idx) return r._idx;
      const toT = this.table(r.to.table), fromT = this.table(r.from.table);
      const map = new Map();
      toT.rows.forEach((row, i) => { const k = keyOf(row[r.to.col]); if (!map.has(k)) map.set(k, i); });
      r._idx = Int32Array.from(fromT.rows, (row) => { const j = map.get(keyOf(row[r.from.col])); return j === undefined ? -1 : j; });
      return r._idx;
    }
    activeRels(ctx) {
      let act = this.rels.filter((r) => r.active);
      for (const id of (ctx && ctx.userel) || []) {
        const r = this.rels[id];
        const pair = (x) => [L(x.from.table), L(x.to.table)].sort().join("|");
        act = act.filter((x) => pair(x) !== pair(r)).concat([r]);
      }
      return act;
    }
    reach(T, ctx) {
      const act = this.activeRels(ctx);
      const sig = L(T) + "|" + act.map((r) => r.id).sort().join(",");
      if (this._reach.has(sig)) return this._reach.get(sig);
      const res = new Map(); // lower table → path(rels)
      const q = [[L(T), []]];
      const seen = new Set([L(T)]);
      while (q.length) {
        const [cur, path] = q.shift();
        for (const r of act) {
          if (L(r.from.table) === cur && !seen.has(L(r.to.table))) {
            seen.add(L(r.to.table));
            const np = path.concat([r]);
            res.set(L(r.to.table), np);
            q.push([L(r.to.table), np]);
          }
        }
      }
      this._reach.set(sig, res);
      return res;
    }
    // T 테이블의 i번째 행에서 X 테이블의 관련 행 번호
    relatedRow(T, i, X, ctx) {
      if (L(T) === L(X)) return i;
      const path = this.reach(T, ctx).get(L(X));
      if (!path) return -2;
      let j = i;
      for (const r of path) { if (j < 0) return -1; j = this.relIndex(r)[j]; }
      return j;
    }
    cellValue(T, i, colRef, ctx) {
      const j = this.relatedRow(T, i, colRef.table, ctx);
      if (j < 0) return null;
      const v = this.table(colRef.table).rows[j][colRef.col];
      return v === undefined ? null : v;
    }
    applies(f, T, reach) {
      if (f.kind === "rows") return L(f.table) === L(T) || reach.has(L(f.table));
      return f.cols.every((c) => L(c.table) === L(T) || reach.has(L(c.table)));
    }
    relSig(ctx) { return (ctx && ctx.userel && ctx.userel.length) ? this.activeRels(ctx).map((r) => r.id).sort().join(",") : "*"; }
    keyArray(T, ref, ctx) {
      const sig = L(T) + "|" + ref.key + "|" + this.relSig(ctx);
      let a = this._arr.get(sig);
      if (!a) {
        const n = this.table(T).rows.length;
        a = new Array(n);
        for (let i = 0; i < n; i++) a[i] = keyOf(this.cellValue(T, i, ref, ctx));
        this._arr.set(sig, a);
      }
      return a;
    }
    relArray(T, X, ctx) {
      const sig = L(T) + ">" + L(X) + "|" + this.relSig(ctx);
      let a = this._arr.get(sig);
      if (!a) {
        const n = this.table(T).rows.length;
        a = new Int32Array(n);
        for (let i = 0; i < n; i++) a[i] = this.relatedRow(T, i, X, ctx);
        this._arr.set(sig, a);
      }
      return a;
    }
    visibleRows(T, ctx) {
      const tk = L(T);
      if (ctx._vis.has(tk)) return ctx._vis.get(tk);
      const tbl = this.table(T);
      const reach = this.reach(T, ctx);
      const fs = ctx.filters.filter((f) => this.applies(f, T, reach));
      let out;
      if (!fs.length) out = tbl.rows.map((_, i) => i);
      else {
        const checks = fs.map((f) => {
          if (f.kind === "rows") { const ra = this.relArray(T, f.table, ctx); return (i) => f.set.has(ra[i]); }
          if (f.cols.length === 1) { const ka = this.keyArray(T, f.cols[0], ctx); return (i) => f.set.has(ka[i]); }
          const kas = f.cols.map((c) => this.keyArray(T, c, ctx));
          return (i) => f.set.has(kas.map((ka) => ka[i]).join("\u0001"));
        });
        // 작은 rows 필터가 있으면 그 행만 검사
        out = [];
        const n = tbl.rows.length;
        const own = fs.find((f) => f.kind === "rows" && L(f.table) === tk);
        const cand = own ? [...own.set].filter((i) => i >= 0 && i < n).sort((a, b) => a - b) : null;
        const loop = (i) => { for (const c of checks) if (!c(i)) return; out.push(i); };
        if (cand) cand.forEach(loop); else for (let i = 0; i < n; i++) loop(i);
      }
      ctx._vis.set(tk, out);
      return out;
    }
    baseTV(T) {
      const tk = L(T);
      if (this._baseTV.has(tk)) return this._baseTV.get(tk);
      const tbl = this.table(T);
      const cols = tbl.columns.map((c) => ({ name: c.name, table: tbl.name, col: c.name }));
      const rows = tbl.rows.map((r, i) => ({ vals: tbl.columns.map((c) => (r[c.name] === undefined ? null : r[c.name])), rid: i }));
      const tv = makeTV(cols, rows, tbl.name);
      this._baseTV.set(tk, tv);
      return tv;
    }
    tableTV(T, ctx) {
      const all = this.baseTV(T), vis = this.visibleRows(T, ctx);
      if (vis.length === all.rows.length) return all;
      return makeTV(all.cols, vis.map((i) => all.rows[i]), all.base);
    }
    dateColumnOf(colRef) {
      const t = this.table(colRef.table);
      return t.dateColumn && L(t.dateColumn) === L(colRef.col);
    }
  }
  function guessType(values) {
    const v = values.find((x) => !isBlank(x));
    if (isDate(v)) return "date";
    if (typeof v === "number") return Number.isInteger(v) ? "int" : "dec";
    if (typeof v === "boolean") return "bool";
    return "text";
  }

  // ───────────────────────── 필터 컨텍스트 ─────────────────────────
  class Ctx {
    constructor(filters, opts) {
      opts = opts || {};
      this.filters = filters || [];
      this.userel = opts.userel || [];
      this.outer = opts.outer || null;
      this.scope = opts.scope || [];
      this._vis = new Map();
    }
    derive(filters, extra) {
      return new Ctx(filters, Object.assign({ userel: this.userel, outer: this.outer, scope: this.scope }, extra || {}));
    }
  }
  const colFilter = (cols, set) => ({ kind: "cols", cols, set });
  const rowsFilter = (table, set) => ({ kind: "rows", table, set });

  // ───────────────────────── 평가기 ─────────────────────────
  class Engine {
    constructor(model) { this.model = model; this.depth = 0; }

    // 공용 진입점
    run(src, ctx) {
      const ast = typeof src === "string" ? parse(src) : src;
      return this.evalAny(ast, { ctx: ctx || new Ctx(), rows: [], vars: new Map() });
    }

    runScalar(src, ctx) {
      const ast = typeof src === "string" ? parse(src) : src;
      return this.evalScalar(ast, { ctx: ctx || new Ctx(), rows: [], vars: new Map() });
    }

    err(msg, node) { return new DaxError(msg, node && node.pos); }

    evalAny(node, env) {
      switch (node.type) {
        case "var": {
          const vars = new Map(env.vars);
          const e2 = { ctx: env.ctx, rows: env.rows, vars };
          for (const v of node.vars) vars.set(L(v.name), this.evalAny(v.expr, e2));
          return this.evalAny(node.body, e2);
        }
        case "tref": case "tc": return this.evalTable(node, env);
        case "name": {
          if (env.vars.has(L(node.name))) return env.vars.get(L(node.name));
          if (this.model.hasTable(node.name)) return this.evalTable(node, env);
          return this.evalScalar(node, env);
        }
        case "call": {
          const f = FN[node.name];
          if (f && f.table) return this.evalTable(node, env);
          return this.evalScalar(node, env);
        }
        default: return this.evalScalar(node, env);
      }
    }

    toScalar(tv, node) {
      if (!isTable(tv)) return tv;
      if (tv.rows.length === 0) return null;
      if (tv.cols.length !== 1) throw this.err(`열이 ${tv.cols.length}개인 테이블은 하나의 값으로 바꿀 수 없습니다.`, node);
      if (tv.rows.length > 1) throw this.err("값이 여러 개인 테이블을 단일 값이 필요한 자리에 썼습니다. (예: VALUES 대신 SELECTEDVALUE나 MAX를 고려하세요)", node);
      return tv.rows[0].vals[0];
    }

    evalScalar(node, env) {
      switch (node.type) {
        case "lit": return node.v;
        case "empty": return null;
        case "var": return this.toScalar(this.evalAny(node, env), node);
        case "unary": {
          const v = this.evalScalar(node.arg, env);
          if (node.op === "NOT") return !toBool(v);
          if (node.op === "+") return v;
          if (isBlank(v)) return null;
          return -this.num(v, node);
        }
        case "bin": return this.binary(node, env);
        case "in": {
          const v = this.evalScalar(node.left, env);
          const tv = this.evalTable(node.right, env);
          const k = keyOf(v);
          return tv.rows.some((r) => keyOf(r.vals[0]) === k || (isBlank(v) && isBlank(r.vals[0])));
        }
        case "col": return this.rowValue(this.model.column(node.table, node.col), env, node);
        case "ref": {
          const m = this.model.measures.get(L(node.name));
          if (m) return this.evalMeasure(m, env);
          const hit = this.findByName(node.name, env);
          if (hit) return hit.value;
          if (env.vars.has(L(node.name))) return this.toScalar(env.vars.get(L(node.name)), node);
          throw this.err(`[${node.name}]은(는) 측정값도 아니고 현재 행에 있는 열도 아닙니다. 측정값이면 이름을 확인하고, 열이면 테이블[열] 형식이나 반복 함수(SUMX 등)를 쓰세요.`, node);
        }
        case "name": {
          if (env.vars.has(L(node.name))) return this.toScalar(env.vars.get(L(node.name)), node);
          if (this.model.hasTable(node.name)) return this.toScalar(this.evalTable(node, env), node);
          throw this.err(`'${node.name}'을(를) 알 수 없습니다. 변수(VAR)·테이블 이름 철자를 확인하거나, 함수라면 뒤에 괄호를 붙이세요.`, node);
        }
        case "tref": case "tc": return this.toScalar(this.evalTable(node, env), node);
        case "call": {
          const f = FN[node.name];
          if (!f) throw this.err(unknownFn(node.name), node);
          checkArity(node, f, this);
          if (f.table) return this.toScalar(f.fn.call(this, node.args, env, node), node);
          return f.fn.call(this, node.args, env, node);
        }
      }
      throw this.err("해석할 수 없는 식입니다.", node);
    }

    evalTable(node, env) {
      switch (node.type) {
        case "tref": return this.model.tableTV(this.model.table(node.name).name, env.ctx);
        case "name": {
          if (env.vars.has(L(node.name))) {
            const v = env.vars.get(L(node.name));
            if (!isTable(v)) throw this.err(`변수 ${node.name}은(는) 테이블이 아니라 값입니다.`, node);
            return v;
          }
          if (this.model.hasTable(node.name)) return this.model.tableTV(this.model.table(node.name).name, env.ctx);
          throw this.err(`'${node.name}' 테이블을 찾을 수 없습니다.`, node);
        }
        case "var": {
          const v = this.evalAny(node, env);
          if (!isTable(v)) throw this.err("여기에는 테이블 식이 필요합니다.", node);
          return v;
        }
        case "tc": {
          const width = Math.max(...node.rows.map((r) => r.length), 1);
          const cols = [];
          for (let i = 0; i < width; i++) cols.push({ name: width === 1 ? "Value" : "Value" + (i + 1), table: null, col: null });
          return makeTV(cols, node.rows.map((r) => ({ vals: r.map((e) => this.evalScalar(e, env)) })));
        }
        case "call": {
          const f = FN[node.name];
          if (!f) throw this.err(unknownFn(node.name), node);
          checkArity(node, f, this);
          if (!f.table) throw this.err(`${node.name}은(는) 값을 돌려주는 함수입니다. 이 자리에는 테이블이 필요합니다.`, node);
          return f.fn.call(this, node.args, env, node);
        }
        case "col":
          throw this.err(`테이블이 필요한 자리에 열 ${node.table}[${node.col}]을(를) 썼습니다. 열의 값 목록이 필요하면 VALUES(${node.table}[${node.col}])를 쓰세요.`, node);
      }
      throw this.err("여기에는 테이블 식(테이블 이름, FILTER, ALL, VALUES 등)이 필요합니다.", node);
    }

    evalMeasure(m, env) {
      if (this.depth > 60) throw this.err(`측정값 [${m.name}]이(가) 자기 자신을 계속 참조합니다(순환 참조).`);
      const ctx = env.rows.length ? this.transition(env) : env.ctx;
      this.depth++;
      try { return this.evalScalar(m.ast, { ctx, rows: [], vars: new Map() }); }
      catch (e) {
        if (e.isDax && !e.inMeasure) { e.message = `[${m.name}] 측정값 계산 중: ` + e.message; e.inMeasure = true; e.pos = undefined; }
        throw e;
      } finally { this.depth--; }
    }

    // 행 컨텍스트 → 필터 컨텍스트
    transition(env, baseCtx) {
      let filters = (baseCtx || env.ctx).filters.slice();
      for (const rc of env.rows) {
        const tv = rc.tv, row = rc.row;
        if (tv.base && row.rid !== undefined) {
          const exp = this.expandedTables(tv.base, env.ctx);
          filters = filters.filter((f) => !(f.kind === "rows" ? L(f.table) === L(tv.base) : f.cols.every((c) => L(c.table) === L(tv.base))));
          void exp;
          filters.push(rowsFilter(tv.base, new Set([row.rid])));
        } else {
          tv.cols.forEach((c, i) => {
            if (!c.table) return;
            const ref = this.model.column(c.table, c.col);
            filters = removeCols(filters, new Set([ref.key]));
            filters.push(colFilter([ref], new Set([keyOf(row.vals[i])])));
          });
        }
      }
      return env.ctx.derive(filters);
    }

    expandedTables(T, ctx) {
      return new Set([L(T), ...this.model.reach(T, ctx).keys()]);
    }

    rowValue(ref, env, node) {
      for (let k = env.rows.length - 1; k >= 0; k--) {
        const { tv, row } = env.rows[k];
        const i = tv.idx.get(ref.key);
        if (i !== undefined) return row.vals[i];
      }
      if (env.rows.length) {
        const rc = env.rows[env.rows.length - 1];
        if (rc.tv.base && this.model.reach(rc.tv.base, env.ctx).has(L(ref.table)))
          throw this.err(`${ref.table}[${ref.col}]은(는) 다른 테이블의 열입니다. 관계를 따라 값을 가져오려면 RELATED(${ref.table}[${ref.col}])를 쓰세요.`, node);
      }
      throw this.err(`${ref.table}[${ref.col}]: 행 컨텍스트가 없어 하나의 값을 정할 수 없습니다. 측정값이라면 SUM(${ref.table}[${ref.col}])처럼 집계하거나 SUMX 같은 반복 함수 안에서 쓰세요.`, node);
    }
    findByName(name, env) {
      for (let k = env.rows.length - 1; k >= 0; k--) {
        const { tv, row } = env.rows[k];
        const i = tv.idx.get("#" + L(name));
        if (i !== undefined) return { value: row.vals[i] };
      }
      return null;
    }

    num(v, node) {
      if (isBlank(v)) return 0;
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (isDate(v)) return serial(v);
      const s = String(v).trim().replace(/,/g, "");
      if (s !== "" && !isNaN(Number(s))) return Number(s);
      throw this.err(`텍스트 "${v}"을(를) 숫자로 바꿀 수 없습니다.`, node);
    }

    binary(node, env) {
      const op = node.op;
      if (op === "&&") return toBool(this.evalScalar(node.left, env)) && toBool(this.evalScalar(node.right, env));
      if (op === "||") return toBool(this.evalScalar(node.left, env)) || toBool(this.evalScalar(node.right, env));
      const a = this.evalScalar(node.left, env), b = this.evalScalar(node.right, env);
      switch (op) {
        case "&": return toText(a) + toText(b);
        case "+":
          if (isBlank(a) && isBlank(b)) return null;
          if (isDate(a) && !isDate(b)) return fromSerial(serial(a) + this.num(b, node));
          if (isDate(b) && !isDate(a)) return fromSerial(serial(b) + this.num(a, node));
          return this.num(a, node) + this.num(b, node);
        case "-":
          if (isBlank(a) && isBlank(b)) return null;
          if (isDate(a) && isDate(b)) return serial(a) - serial(b);
          if (isDate(a)) return fromSerial(serial(a) - this.num(b, node));
          return this.num(a, node) - this.num(b, node);
        case "*":
          if (isBlank(a) || isBlank(b)) return null;
          return this.num(a, node) * this.num(b, node);
        case "/":
          if (isBlank(a)) return null;
          { const d = this.num(b, node), x = this.num(a, node); return x / d; }
        case "^": if (isBlank(a)) return null; return Math.pow(this.num(a, node), this.num(b, node));
        case "==": return strictEq(a, b);
        default: {
          const c = this.compare(a, b, node);
          switch (op) {
            case "=": return c === 0;
            case "<>": return c !== 0;
            case "<": return c < 0;
            case ">": return c > 0;
            case "<=": return c <= 0;
            case ">=": return c >= 0;
          }
        }
      }
      throw this.err("알 수 없는 연산자 " + op, node);
    }
    compare(a, b, node) {
      if (isBlank(a) && isBlank(b)) return 0;
      if (isBlank(a)) a = blankLike(b);
      if (isBlank(b)) b = blankLike(a);
      const ta = typeof a === "string" ? "s" : "n", tb = typeof b === "string" ? "s" : "n";
      if (ta !== tb) {
        if (isDate(a) || isDate(b)) {
          const s = ta === "s" ? a : b, dt = Date.parse(s);
          if (!isNaN(dt)) { const d2 = new Date(dt); const x = isDate(a) ? serial(a) : serial(d2), y = isDate(b) ? serial(b) : serial(d2); return x < y ? -1 : x > y ? 1 : 0; }
        }
        throw this.err(`텍스트 값과 숫자/날짜 값을 비교할 수 없습니다: ${JSON.stringify(toText(a))} vs ${JSON.stringify(toText(b))}. 숫자 열이면 따옴표를 빼고 쓰세요.`, node);
      }
      if (ta === "s") { const x = L(a), y = L(b); return x < y ? -1 : x > y ? 1 : 0; }
      const x = this.num(a), y = this.num(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }

    // 인수 도우미
    colArg(node, fname) {
      if (node && node.type === "col") return this.model.column(node.table, node.col);
      if (node && node.type === "ref") {
        throw this.err(`${fname}의 인수 [${node.name}]에는 테이블 이름까지 붙인 열 참조(예: 판매[${node.name}])가 필요합니다. 측정값은 이 자리에 올 수 없습니다.`, node);
      }
      throw this.err(`${fname}의 이 인수에는 열 참조(테이블[열])가 필요합니다.`, node);
    }
    kw(node) { return node && node.type === "name" ? node.name.toUpperCase() : node && node.type === "lit" && typeof node.v === "number" ? node.v : null; }

    columnValues(ref, ctx) {
      const rows = this.model.table(ref.table).rows;
      return this.model.visibleRows(ref.table, ctx).map((i) => { const v = rows[i][ref.col]; return v === undefined ? null : v; });
    }
    distinctTV(refs, ctx, ignoreFilters) {
      const T = refs[0].table;
      refs.forEach((r) => { if (L(r.table) !== L(T)) throw new DaxError("여러 테이블의 열을 함께 쓰려면 SUMMARIZE나 CROSSJOIN을 쓰세요."); });
      const tbl = this.model.table(T);
      const idxs = ignoreFilters ? tbl.rows.map((_, i) => i) : this.model.visibleRows(T, ctx);
      const seen = new Map();
      for (const i of idxs) {
        const vals = refs.map((r) => (tbl.rows[i][r.col] === undefined ? null : tbl.rows[i][r.col]));
        const k = tupleKey(vals);
        if (!seen.has(k)) seen.set(k, { vals });
      }
      return makeTV(refs.map((r) => ({ name: r.col, table: r.table, col: r.col })), [...seen.values()]);
    }

    iterate(tableNode, exprNode, env, cb) {
      const tv = this.evalTable(tableNode, env);
      for (const row of tv.rows) {
        const e2 = { ctx: env.ctx, rows: env.rows.concat([{ tv, row }]), vars: env.vars };
        cb(this.evalScalar(exprNode, e2), row, tv);
      }
      return tv;
    }

    // ── CALCULATE ──
    calcCtx(filterArgs, env) {
      // 1) 필터 인수는 원래 컨텍스트에서 평가
      const mods = [], adds = [];
      for (const a of filterArgs) {
        if (a.type === "empty") continue;
        const up = a.type === "call" ? a.name : null;
        if (["ALL", "REMOVEFILTERS", "ALLEXCEPT", "ALLSELECTED", "ALLNOBLANKROW", "USERELATIONSHIP", "CROSSFILTER"].includes(up)) mods.push(a);
        else if (up === "KEEPFILTERS") adds.push({ keep: true, f: this.filterFromArg(a.args[0], env) });
        else adds.push({ keep: false, f: this.filterFromArg(a, env) });
      }
      // 2) 컨텍스트 전환
      let ctx = env.rows.length ? this.transition(env) : env.ctx;
      let filters = ctx.filters.slice();
      let userel = ctx.userel.slice();
      // 3) 수정자
      for (const a of mods) {
        if (a.name === "USERELATIONSHIP") {
          const c1 = this.colArg(a.args[0], "USERELATIONSHIP"), c2 = this.colArg(a.args[1], "USERELATIONSHIP");
          const r = this.model.rels.find((r) => (r.from.key === c1.key && r.to.key === c2.key) || (r.from.key === c2.key && r.to.key === c1.key));
          if (!r) throw this.err(`${c1.table}[${c1.col}]와 ${c2.table}[${c2.col}] 사이에 관계가 없습니다. 모델 보기에서 (비활성) 관계를 먼저 만들어야 합니다.`, a);
          userel.push(r.id);
        } else if (a.name === "CROSSFILTER") {
          // 단순화: 무시
        } else if (a.name === "ALLSELECTED") {
          filters = this.applyAllSelected(a, filters, ctx);
        } else if (a.name === "ALLEXCEPT") {
          const T = this.tableNameArg(a.args[0]);
          const keep = new Set(a.args.slice(1).map((x) => this.colArg(x, "ALLEXCEPT").key));
          const exp = this.expandedTables(T, ctx);
          filters = filters.map((f) => {
            if (f.kind === "rows") return exp.has(L(f.table)) ? null : f;
            if (f.cols.every((c) => keep.has(c.key))) return f;
            return f.cols.some((c) => exp.has(L(c.table))) ? null : f;
          }).filter(Boolean);
        } else {
          // ALL / REMOVEFILTERS / ALLNOBLANKROW
          if (!a.args.length || a.args[0].type === "empty") { filters = []; continue; }
          if (a.args[0].type === "col") {
            const keys = new Set(a.args.map((x) => this.colArg(x, a.name).key));
            filters = removeCols(filters, keys);
          } else {
            const T = this.tableNameArg(a.args[0]);
            const exp = this.expandedTables(T, ctx);
            filters = filters.filter((f) => f.kind === "rows" ? !exp.has(L(f.table)) : !f.cols.some((c) => exp.has(L(c.table))));
          }
        }
      }
      // 4) 필터 적용
      for (const { keep, f } of adds) {
        if (!keep) {
          if (f.kind === "rows") {
            const exp = this.expandedTables(f.table, ctx);
            filters = filters.filter((g) => g.kind === "rows" ? !exp.has(L(g.table)) : !g.cols.every((c) => exp.has(L(c.table))));
          } else {
            filters = removeCols(filters, new Set(f.cols.map((c) => c.key)));
            // 날짜 테이블로 표시된 테이블의 날짜 열에 필터 → 날짜 테이블의 다른 필터 제거
            for (const c of f.cols) if (this.model.dateColumnOf(c)) filters = filters.filter((g) => g.kind === "rows" ? L(g.table) !== L(c.table) : !g.cols.every((x) => L(x.table) === L(c.table)));
          }
        }
        filters.push(f);
      }
      return ctx.derive(filters, { userel });
    }
    applyAllSelected(a, filters, ctx) {
      const outer = ctx.outer ? ctx.outer.filters : [];
      if (!a.args.length || a.args[0].type === "empty") return outer.slice();
      let keys;
      if (a.args[0].type === "col") keys = new Set(a.args.map((x) => this.colArg(x, "ALLSELECTED").key));
      else {
        const T = this.tableNameArg(a.args[0]);
        keys = new Set(this.model.table(T).columns.map((c) => L(T) + "[" + L(c.name) + "]"));
      }
      const touches = (f) => f.kind === "cols" && f.cols.some((c) => keys.has(c.key));
      return filters.filter((f) => !touches(f)).concat(outer.filter(touches));
    }
    tableNameArg(node) {
      if (node.type === "tref" || node.type === "name") return this.model.table(node.name).name;
      throw this.err("이 자리에는 테이블 이름이 필요합니다.", node);
    }
    filterFromArg(a, env) {
      const isTableExpr = a.type === "tref" || (a.type === "name" && (this.model.hasTable(a.name) || isTable(env.vars.get(L(a.name))))) || a.type === "tc" || (a.type === "call" && FN[a.name] && FN[a.name].table);
      if (isTableExpr) {
        const tv = this.evalTable(a, env);
        return this.filterFromTable(tv, a);
      }
      // 불리언 식 → FILTER(ALL(열들), 식)
      const refs = [];
      collectCols(a, refs, this.model);
      if (!refs.length) {
        const v = this.evalScalar(a, env);
        if (typeof v !== "boolean") throw this.err("CALCULATE의 필터 인수는 조건식(예: 제품[분류명] = \"의류\")이나 테이블이어야 합니다.", a);
        return { kind: "const", ok: v };
      }
      const T = refs[0].table;
      if (refs.some((r) => L(r.table) !== L(T))) throw this.err("CALCULATE의 조건식 하나에는 한 테이블의 열만 쓸 수 있습니다. 여러 테이블이면 FILTER를 쓰세요.", a);
      if (containsMeasure(a, this.model)) throw this.err("CALCULATE의 조건식 필터 안에서는 측정값을 쓸 수 없습니다. FILTER(테이블, [측정값] > 값) 형태로 바꾸세요.", a);
      const tv = this.distinctTV(refs, env.ctx, true);
      const set = new Set();
      for (const row of tv.rows) {
        const e2 = { ctx: env.ctx, rows: env.rows.concat([{ tv, row }]), vars: env.vars };
        if (toBool(this.evalScalar(a, e2))) set.add(tupleKey(row.vals));
      }
      return colFilter(refs, set);
    }
    filterFromTable(tv, node) {
      if (tv.base && tv.rows.every((r) => r.rid !== undefined)) return rowsFilter(tv.base, new Set(tv.rows.map((r) => r.rid)));
      const idx = [], refs = [];
      tv.cols.forEach((c, i) => { if (c.table) { refs.push(this.model.column(c.table, c.col)); idx.push(i); } });
      if (!refs.length) throw this.err("필터로 쓴 테이블에 모델 열과 연결된(계보가 있는) 열이 없습니다. 이런 테이블을 필터로 쓰려면 TREATAS를 쓰세요.", node);
      const set = new Set(tv.rows.map((r) => idx.map((i) => keyOf(r.vals[i])).join("\u0001")));
      return colFilter(refs, set);
    }

    // ── 시간 인텔리전스 도우미 ──
    datesTV(ref, dates) {
      return makeTV([{ name: ref.col, table: ref.table, col: ref.col }], dates.map((d) => ({ vals: [d] })));
    }
    allDates(ref) {
      if (!ref._all) {
        const vals = this.model.table(ref.table).rows.map((r) => r[ref.col]).filter(isDate).sort((a, b) => a - b);
        ref._all = vals;
      }
      return ref._all;
    }
    visibleDates(ref, env) {
      return this.columnValues(ref, env.ctx).filter(isDate).sort((a, b) => a - b);
    }
    dateRef(node, env, fname) {
      if (node.type === "col") return this.model.column(node.table, node.col);
      throw this.err(`${fname}의 첫 인수에는 날짜 열(예: 날짜[날짜])이 필요합니다.`, node);
    }
    keepExisting(ref, dates) {
      const all = new Set(this.allDates(ref).map((d) => d.getTime()));
      return dates.filter((d) => all.has(d.getTime()));
    }
    shiftDates(ref, dates, n, unit) {
      if (!dates.length) return [];
      unit = String(unit).toUpperCase();
      if (unit === "DAY") return this.keepExisting(ref, dates.map((d) => new Date(d.getTime() + n * DAY)));
      const months = unit === "MONTH" ? n : unit === "QUARTER" ? 3 * n : unit === "YEAR" ? 12 * n : null;
      if (months === null) throw new DaxError(`기간 단위는 DAY, MONTH, QUARTER, YEAR 중 하나여야 합니다. (받은 값: ${unit})`);
      // 완전한 월 단위 선택이면 이동 후에도 완전한 월
      const byMonth = new Map();
      dates.forEach((d) => { const [y, m] = ymd(d); const k = y * 12 + m - 1; byMonth.set(k, (byMonth.get(k) || 0) + 1); });
      const full = [...byMonth.entries()].every(([k, c]) => c === lastDay(Math.floor(k / 12), k % 12 + 1));
      if (full) {
        const out = [];
        [...byMonth.keys()].sort((a, b) => a - b).forEach((k) => {
          const t = k + months, y = Math.floor(t / 12), m = t % 12 + 1;
          for (let d = 1; d <= lastDay(y, m); d++) out.push(mk(y, m, d));
        });
        return this.keepExisting(ref, out);
      }
      const seen = new Set(), out = [];
      dates.forEach((d) => { const x = addMonths(d, months); if (!seen.has(x.getTime())) { seen.add(x.getTime()); out.push(x); } });
      return this.keepExisting(ref, out.sort((a, b) => a - b));
    }
    periodRange(ref, d, unit, offset) {
      const [y, m] = ymd(d);
      let s, e;
      if (unit === "MONTH") { const t = y * 12 + m - 1 + offset; const yy = Math.floor(t / 12), mm = t % 12 + 1; s = mk(yy, mm, 1); e = mk(yy, mm, lastDay(yy, mm)); }
      else if (unit === "QUARTER") { const q0 = Math.floor((m - 1) / 3); const t = y * 4 + q0 + offset; const yy = Math.floor(t / 4), qm = (t % 4) * 3 + 1; s = mk(yy, qm, 1); e = mk(yy, qm + 2, lastDay(yy, qm + 2)); }
      else if (unit === "YEAR") { s = mk(y + offset, 1, 1); e = mk(y + offset, 12, 31); }
      else { s = new Date(d.getTime() + offset * DAY); e = s; }
      return this.allDates(ref).filter((x) => x >= s && x <= e);
    }
  }

  function removeCols(filters, keys) {
    return filters.filter((f) => !(f.kind === "cols" && f.cols.some((c) => keys.has(c.key))));
  }
  function collectCols(node, out, model) {
    if (!node || typeof node !== "object") return;
    if (node.type === "col") { const r = model.column(node.table, node.col); if (!out.some((x) => x.key === r.key)) out.push(r); return; }
    if (node.type === "call" && FN[node.name] && FN[node.name].table) return;
    for (const k of ["left", "right", "arg", "body"]) if (node[k]) collectCols(node[k], out, model);
    if (node.args) node.args.forEach((a) => collectCols(a, out, model));
  }
  function containsMeasure(node, model) {
    if (!node || typeof node !== "object") return false;
    if (node.type === "ref") return model.measures.has(L(node.name));
    return ["left", "right", "arg"].some((k) => node[k] && containsMeasure(node[k], model)) || (node.args || []).some((a) => containsMeasure(a, model));
  }
  function toBool(v) {
    if (isBlank(v)) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (isDate(v)) return true;
    const s = L(v);
    if (s === "true") return true; if (s === "false") return false;
    throw new DaxError(`텍스트 "${v}"을(를) TRUE/FALSE로 바꿀 수 없습니다.`);
  }
  function toText(v) {
    if (isBlank(v)) return "";
    if (isDate(v)) return fmtDate(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return String(Number.isInteger(v) ? v : Number(v.toPrecision(15)));
    return String(v);
  }
  function blankLike(o) { if (typeof o === "string") return ""; if (typeof o === "boolean") return false; if (isDate(o)) return fromSerial(0); return 0; }
  function strictEq(a, b) {
    if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
    if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
    if (typeof a === "string" && typeof b === "string") return L(a) === L(b);
    return a === b;
  }

  // ───────────────────────── 함수 정의 ─────────────────────────
  const FN = {};
  // def(이름, 최소인수, 최대인수, 테이블반환?, 구현, 설명, 범주)
  function def(names, min, max, table, fn, sig, desc, cat) {
    names.split(",").forEach((n) => (FN[n] = { min, max, table, fn, sig: sig || "", desc: desc || "", cat: cat || "기타" }));
  }
  function checkArity(node, f, eng) {
    const n = node.args.length;
    if (n < f.min) throw eng.err(`${node.name} 함수에 인수가 부족합니다. 형식: ${f.sig}`, node);
    if (f.max >= 0 && n > f.max) throw eng.err(`${node.name} 함수의 인수가 너무 많습니다. 형식: ${f.sig}`, node);
  }
  const FN_NAMES = () => Object.keys(FN);
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function unknownFn(name) {
    const best = FN_NAMES().map((n) => [n, lev(n, name)]).sort((a, b) => a[1] - b[1])[0];
    return `${name} 함수는 이 시뮬레이터에서 지원하지 않거나 철자가 틀렸습니다.` + (best && best[1] <= 3 ? ` 혹시 ${best[0]}인가요?` : "");
  }

  // 집계
  function aggCol(name, reducer, desc) {
    def(name, 1, 1, false, function (args, env) {
      const ref = this.colArg(args[0], name);
      return reducer(this.columnValues(ref, env.ctx));
    }, `${name}(<열>)`, desc, "집계");
  }
  const nums = (vals) => vals.filter((v) => typeof v === "number" || isDate(v)).map((v) => (isDate(v) ? serial(v) : v));
  aggCol("SUM", (v) => { const n = nums(v); return n.length ? n.reduce((a, b) => a + b, 0) : null; }, "열의 합계");
  aggCol("AVERAGE", (v) => { const n = nums(v); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; }, "열의 평균(빈 값 제외)");
  aggCol("MEDIAN", (v) => { const n = nums(v).sort((a, b) => a - b); if (!n.length) return null; const h = n.length >> 1; return n.length % 2 ? n[h] : (n[h - 1] + n[h]) / 2; }, "열의 중앙값");
  aggCol("COUNT", (v) => { const c = v.filter((x) => !isBlank(x) && typeof x !== "boolean").length; return c || null; }, "빈 값이 아닌 값 개수(숫자·날짜·텍스트)");
  aggCol("COUNTA", (v) => { const c = v.filter((x) => !isBlank(x)).length; return c || null; }, "빈 값이 아닌 값 개수");
  aggCol("COUNTBLANK", (v) => { const c = v.filter((x) => isBlank(x) || x === "").length; return c || null; }, "빈 값 개수");
  aggCol("DISTINCTCOUNT", (v) => { const s = new Set(v.map(keyOf)); return s.size || null; }, "고유 값 개수");
  aggCol("DISTINCTCOUNTNOBLANK", (v) => { const s = new Set(v.filter((x) => !isBlank(x)).map(keyOf)); return s.size || null; }, "빈 값을 뺀 고유 값 개수");
  function minmax(name, sign) {
    def(name, 1, 2, false, function (args, env) {
      if (args.length === 2) {
        const a = this.evalScalar(args[0], env), b = this.evalScalar(args[1], env);
        if (isBlank(a)) return b; if (isBlank(b)) return a;
        return this.compare(a, b) * sign > 0 ? a : b;
      }
      const ref = this.colArg(args[0], name);
      const vals = this.columnValues(ref, env.ctx).filter((v) => !isBlank(v));
      if (!vals.length) return null;
      return vals.reduce((a, b) => (this.compare(a, b) * sign >= 0 ? a : b));
    }, `${name}(<열>) 또는 ${name}(<값1>, <값2>)`, sign > 0 ? "최댓값" : "최솟값", "집계");
  }
  minmax("MAX", 1); minmax("MIN", -1);
  def("MAXA", 1, 1, false, function (a, e) { return FN.MAX.fn.call(this, a, e); }, "MAXA(<열>)", "최댓값", "집계");
  def("MINA", 1, 1, false, function (a, e) { return FN.MIN.fn.call(this, a, e); }, "MINA(<열>)", "최솟값", "집계");
  def("COUNTROWS", 0, 1, false, function (args, env) {
    if (!args.length) throw this.err("COUNTROWS(<테이블>) 형식으로 테이블을 넣어 주세요.");
    const tv = this.evalTable(args[0], env);
    return tv.rows.length || null;
  }, "COUNTROWS(<테이블>)", "테이블의 행 수", "집계");

  function iterAgg(name, init, step, finish, desc) {
    def(name, 2, 2, false, function (args, env) {
      let acc = init(), any = false;
      this.iterate(args[0], args[1], env, (v) => { if (!isBlank(v)) { any = true; acc = step(acc, v, this); } });
      return finish(acc, any);
    }, `${name}(<테이블>, <식>)`, desc, "반복");
  }
  iterAgg("SUMX", () => 0, (a, v, e) => a + e.num(v), (a, any) => (any ? a : null), "테이블의 각 행에서 식을 계산해 합계");
  iterAgg("AVERAGEX", () => ({ s: 0, n: 0 }), (a, v, e) => ({ s: a.s + e.num(v), n: a.n + 1 }), (a, any) => (any ? a.s / a.n : null), "각 행 계산값의 평균");
  iterAgg("COUNTX", () => 0, (a) => a + 1, (a, any) => (any ? a : null), "각 행 계산값 중 빈 값이 아닌 개수");
  iterAgg("MAXX", () => null, (a, v, e) => (a === null || e.compare(v, a) > 0 ? v : a), (a) => a, "각 행 계산값의 최댓값");
  iterAgg("MINX", () => null, (a, v, e) => (a === null || e.compare(v, a) < 0 ? v : a), (a) => a, "각 행 계산값의 최솟값");
  def("PRODUCTX", 2, 2, false, function (args, env) { let p = 1, any = false; this.iterate(args[0], args[1], env, (v) => { if (!isBlank(v)) { any = true; p *= this.num(v); } }); return any ? p : null; }, "PRODUCTX(<테이블>, <식>)", "각 행 계산값의 곱", "반복");
  def("CONCATENATEX", 2, 5, false, function (args, env) {
    const items = [];
    this.iterate(args[0], args[1], env, (v, row, tv) => {
      let o = null;
      if (args[3] && args[3].type !== "empty") o = this.evalScalar(args[3], { ctx: env.ctx, rows: env.rows.concat([{ tv, row }]), vars: env.vars });
      items.push({ v: toText(v), o });
    });
    const delim = args[2] && args[2].type !== "empty" ? toText(this.evalScalar(args[2], env)) : "";
    if (args[3] && args[3].type !== "empty") {
      const dir = this.kw(args[4]) === "DESC" ? -1 : 1;
      items.sort((a, b) => this.compare(a.o, b.o) * dir);
    }
    return items.map((x) => x.v).join(delim);
  }, "CONCATENATEX(<테이블>, <식>, [구분자], [정렬식], [ASC|DESC])", "각 행 값을 이어 붙인 텍스트", "반복");
  def("RANKX", 2, 5, false, function (args, env) {
    const vals = [];
    this.iterate(args[0], args[1], env, (v) => vals.push(isBlank(v) ? null : v));
    const cur = args[2] && args[2].type !== "empty" ? this.evalScalar(args[2], env) : this.evalScalar(args[1], env);
    if (isBlank(cur) && !(args[2] && args[2].type !== "empty")) {
      // 현재 값이 비어 있으면 빈 값의 순위
    }
    const ok = this.kw(args[3]);
    const asc = ok === "ASC" || ok === 1 || ok === "TRUE";
    const tie = this.kw(args[4]) === "DENSE" ? "DENSE" : "SKIP";
    const c = isBlank(cur) ? 0 : this.num(cur);
    const better = (v) => { const x = isBlank(v) ? 0 : this.num(v); return asc ? x < c : x > c; };
    if (tie === "DENSE") return 1 + new Set(vals.filter(better).map((v) => (isBlank(v) ? 0 : this.num(v)))).size;
    return 1 + vals.filter(better).length;
  }, "RANKX(<테이블>, <식>, [값], [ASC|DESC], [SKIP|DENSE])", "테이블 안에서 현재 값의 순위", "반복");

  // CALCULATE 계열
  def("CALCULATE", 1, -1, false, function (args, env) {
    const ctx = this.calcCtx(args.slice(1), env);
    if (ctx.filters.some((f) => f.kind === "const" && !f.ok)) return null;
    ctx.filters = ctx.filters.filter((f) => f.kind !== "const");
    return this.evalScalar(args[0], { ctx, rows: [], vars: env.vars });
  }, "CALCULATE(<식>, [필터1], [필터2], ...)", "필터 컨텍스트를 바꿔서 식을 계산", "필터");
  def("CALCULATETABLE", 1, -1, true, function (args, env) {
    const ctx = this.calcCtx(args.slice(1), env);
    if (ctx.filters.some((f) => f.kind === "const" && !f.ok)) { const tv = this.evalTable(args[0], { ctx, rows: [], vars: env.vars }); return makeTV(tv.cols, [], tv.base); }
    ctx.filters = ctx.filters.filter((f) => f.kind !== "const");
    return this.evalTable(args[0], { ctx, rows: [], vars: env.vars });
  }, "CALCULATETABLE(<테이블식>, [필터], ...)", "필터 컨텍스트를 바꿔서 테이블을 계산", "필터");
  def("FILTER", 2, 2, true, function (args, env) {
    const tv = this.evalTable(args[0], env);
    const rows = tv.rows.filter((row) => toBool(this.evalScalar(args[1], { ctx: env.ctx, rows: env.rows.concat([{ tv, row }]), vars: env.vars })));
    return makeTV(tv.cols, rows, tv.base);
  }, "FILTER(<테이블>, <조건>)", "조건을 만족하는 행만 남긴 테이블", "필터");
  function allTable(name) {
    def(name, 0, -1, true, function (args, env, node) {
      if (!args.length || args[0].type === "empty") throw this.err(`${name}()처럼 인수 없이 쓰는 형태는 CALCULATE의 필터 인수에서만 쓸 수 있습니다.`, node);
      if (args[0].type === "col") return this.distinctTV(args.map((a) => this.colArg(a, name)), env.ctx, true);
      const T = this.tableNameArg(args[0]);
      return this.model.baseTV(T);
    }, `${name}(<테이블> 또는 <열>, ...)`, "필터를 무시한 전체 행/값 (CALCULATE 안에서는 필터 제거)", "필터");
  }
  allTable("ALL"); allTable("ALLNOBLANKROW");
  def("REMOVEFILTERS", 0, -1, true, function (args, env, node) { throw this.err("REMOVEFILTERS는 CALCULATE의 필터 인수로만 쓸 수 있습니다.", node); }, "REMOVEFILTERS([테이블 또는 열])", "CALCULATE 안에서 필터 제거", "필터");
  def("ALLEXCEPT", 2, -1, true, function (args, env) {
    const T = this.tableNameArg(args[0]);
    const keep = new Set(args.slice(1).map((x) => this.colArg(x, "ALLEXCEPT").key));
    const ctx = env.ctx.derive(env.ctx.filters.filter((f) => f.kind === "cols" && f.cols.every((c) => keep.has(c.key))));
    return this.model.tableTV(T, ctx);
  }, "ALLEXCEPT(<테이블>, <남길 열>, ...)", "지정한 열의 필터만 남기고 모두 제거", "필터");
  def("ALLSELECTED", 0, -1, true, function (args, env) {
    const outer = env.ctx.outer || new Ctx();
    if (!args.length) throw this.err("ALLSELECTED()는 CALCULATE의 필터 인수로 쓰세요.");
    if (args[0].type === "col") return this.distinctTV(args.map((a) => this.colArg(a, "ALLSELECTED")), outer);
    return this.model.tableTV(this.tableNameArg(args[0]), outer);
  }, "ALLSELECTED([테이블 또는 열])", "보고서(슬라이서)에서 선택된 범위만 유지", "필터");
  def("KEEPFILTERS", 1, 1, true, function (args, env, node) { throw this.err("KEEPFILTERS는 CALCULATE의 필터 인수 안에서만 쓸 수 있습니다.", node); }, "KEEPFILTERS(<필터>)", "기존 필터를 덮어쓰지 않고 교집합", "필터");
  def("USERELATIONSHIP", 2, 2, true, function (args, env, node) { throw this.err("USERELATIONSHIP는 CALCULATE의 필터 인수로만 쓸 수 있습니다.", node); }, "USERELATIONSHIP(<열1>, <열2>)", "비활성 관계를 이 계산에서만 사용", "관계");
  def("CROSSFILTER", 3, 3, true, function (args, env, node) { throw this.err("CROSSFILTER는 CALCULATE 안에서만 쓸 수 있습니다(이 시뮬레이터에서는 효과 없음).", node); }, "CROSSFILTER(<열1>, <열2>, <방향>)", "교차 필터 방향 변경(시뮬레이터 미지원)", "관계");
  def("VALUES,DISTINCT", 1, 1, true, function (args, env) {
    if (args[0].type === "col") return this.distinctTV([this.colArg(args[0], "VALUES")], env.ctx);
    const tv = this.evalTable(args[0], env);
    if (tv.base) return tv;
    const seen = new Map(); tv.rows.forEach((r) => { const k = tupleKey(r.vals); if (!seen.has(k)) seen.set(k, r); });
    return makeTV(tv.cols, [...seen.values()]);
  }, "VALUES(<열 또는 테이블>)", "현재 필터에서 보이는 고유 값 목록", "필터");
  def("RELATED", 1, 1, false, function (args, env, node) {
    const ref = this.colArg(args[0], "RELATED");
    for (let k = env.rows.length - 1; k >= 0; k--) {
      const { tv, row } = env.rows[k];
      const i = tv.idx.get(ref.key);
      if (i !== undefined) return row.vals[i];
      if (tv.base && row.rid !== undefined) {
        const j = this.model.relatedRow(tv.base, row.rid, ref.table, env.ctx);
        if (j === -2) throw this.err(`${tv.base} 테이블에서 ${ref.table} 테이블로 가는 (다대일) 관계가 없습니다. RELATED는 '다' 쪽에서 '1' 쪽 값을 가져올 때 씁니다.`, node);
        if (j < 0) return null;
        const v = this.model.table(ref.table).rows[j][ref.col];
        return v === undefined ? null : v;
      }
    }
    throw this.err("RELATED는 행 컨텍스트(계산 열이나 SUMX·FILTER 같은 반복 함수) 안에서만 쓸 수 있습니다.", node);
  }, "RELATED(<열>)", "관계로 연결된 1쪽 테이블의 값", "관계");
  def("RELATEDTABLE", 1, 1, true, function (args, env, node) {
    if (!env.rows.length) throw this.err("RELATEDTABLE은 행 컨텍스트 안에서 쓰세요(예: 제품 테이블의 계산 열).", node);
    const ctx = this.transition(env);
    return this.model.tableTV(this.tableNameArg(args[0]), ctx);
  }, "RELATEDTABLE(<테이블>)", "현재 행과 관련된 '다' 쪽 행들", "관계");
  def("SELECTEDVALUE", 1, 2, false, function (args, env) {
    const ref = this.colArg(args[0], "SELECTEDVALUE");
    const tv = this.distinctTV([ref], env.ctx);
    if (tv.rows.length === 1) return tv.rows[0].vals[0];
    return args[1] ? this.evalScalar(args[1], env) : null;
  }, "SELECTEDVALUE(<열>, [대체값])", "값이 하나만 선택돼 있으면 그 값", "정보");
  def("HASONEVALUE", 1, 1, false, function (args, env) { return this.distinctTV([this.colArg(args[0], "HASONEVALUE")], env.ctx).rows.length === 1; }, "HASONEVALUE(<열>)", "보이는 값이 하나인지", "정보");
  def("ISFILTERED", 1, 1, false, function (args, env) {
    if (args[0].type === "col") { const k = this.colArg(args[0], "ISFILTERED").key; return env.ctx.filters.some((f) => f.kind === "cols" && f.cols.some((c) => c.key === k)); }
    const T = L(this.tableNameArg(args[0]));
    return env.ctx.filters.some((f) => (f.kind === "rows" ? L(f.table) === T : f.cols.some((c) => L(c.table) === T)));
  }, "ISFILTERED(<열 또는 테이블>)", "직접 필터가 걸려 있는지", "정보");
  def("ISCROSSFILTERED", 1, 1, false, function (args, env) {
    const ref = this.colArg(args[0], "ISCROSSFILTERED");
    return this.distinctTV([ref], env.ctx).rows.length < this.distinctTV([ref], env.ctx, true).rows.length;
  }, "ISCROSSFILTERED(<열>)", "다른 필터 때문에라도 걸러졌는지", "정보");
  def("ISINSCOPE", 1, 1, false, function (args, env) { const k = this.colArg(args[0], "ISINSCOPE").key; return env.ctx.scope.includes(k); }, "ISINSCOPE(<열>)", "행렬에서 그 열 수준으로 그룹화 중인지", "정보");
  def("EARLIER", 1, 2, false, function (args, env, node) {
    const ref = this.colArg(args[0], "EARLIER");
    let skip = args[1] ? this.num(this.evalScalar(args[1], env)) : 1;
    for (let k = env.rows.length - 1; k >= 0; k--) {
      const i = env.rows[k].tv.idx.get(ref.key);
      if (i !== undefined) { if (skip === 0) return env.rows[k].row.vals[i]; skip--; }
    }
    throw this.err("EARLIER는 바깥쪽 행 컨텍스트가 있어야 합니다(예: 계산 열 안의 FILTER).", node);
  }, "EARLIER(<열>)", "바깥쪽 행 컨텍스트의 값", "관계");
  def("TREATAS", 2, -1, true, function (args, env, node) {
    const tv = this.evalTable(args[0], env);
    const refs = args.slice(1).map((a) => this.colArg(a, "TREATAS"));
    if (refs.length !== tv.cols.length) throw this.err("TREATAS의 열 개수가 테이블 열 개수와 같아야 합니다.", node);
    return makeTV(refs.map((r) => ({ name: r.col, table: r.table, col: r.col })), tv.rows.map((r) => ({ vals: r.vals })));
  }, "TREATAS(<테이블>, <열>, ...)", "테이블 값을 모델 열의 필터로 적용", "관계");

  // 논리
  def("IF,IF.EAGER", 2, 3, false, function (args, env) {
    return toBool(this.evalScalar(args[0], env)) ? this.evalScalar(args[1], env) : args[2] ? this.evalScalar(args[2], env) : null;
  }, "IF(<조건>, <참일 때>, [거짓일 때])", "조건 분기", "논리");
  def("SWITCH", 3, -1, false, function (args, env) {
    const v = this.evalScalar(args[0], env);
    let i = 1;
    for (; i + 1 < args.length; i += 2) {
      const c = this.evalScalar(args[i], env);
      if (typeof v === "boolean" ? v === toBool(c) : strictEq(v, c) || (!isBlank(v) && !isBlank(c) && keyOf(v) === keyOf(c))) return this.evalScalar(args[i + 1], env);
    }
    return i < args.length ? this.evalScalar(args[i], env) : null;
  }, "SWITCH(<식>, <값1>, <결과1>, ..., [기타])", "여러 조건 분기 (SWITCH(TRUE(), 조건, 결과, ...))", "논리");
  def("AND", 2, 2, false, function (a, e) { return toBool(this.evalScalar(a[0], e)) && toBool(this.evalScalar(a[1], e)); }, "AND(<조건1>, <조건2>)", "둘 다 참", "논리");
  def("OR", 2, 2, false, function (a, e) { return toBool(this.evalScalar(a[0], e)) || toBool(this.evalScalar(a[1], e)); }, "OR(<조건1>, <조건2>)", "하나라도 참", "논리");
  def("NOT", 1, 1, false, function (a, e) { return !toBool(this.evalScalar(a[0], e)); }, "NOT(<조건>)", "논리 부정", "논리");
  def("TRUE", 0, 0, false, () => true, "TRUE()", "참", "논리");
  def("FALSE", 0, 0, false, () => false, "FALSE()", "거짓", "논리");
  def("BLANK", 0, 0, false, () => null, "BLANK()", "빈 값", "논리");
  def("ISBLANK", 1, 1, false, function (a, e) { return isBlank(this.evalScalar(a[0], e)); }, "ISBLANK(<값>)", "빈 값인지", "정보");
  def("ISNUMBER", 1, 1, false, function (a, e) { return typeof this.evalScalar(a[0], e) === "number"; }, "ISNUMBER(<값>)", "숫자인지", "정보");
  def("ISTEXT", 1, 1, false, function (a, e) { return typeof this.evalScalar(a[0], e) === "string"; }, "ISTEXT(<값>)", "텍스트인지", "정보");
  def("ISERROR", 1, 1, false, function (a, e) { try { const v = this.evalScalar(a[0], e); return typeof v === "number" && !isFinite(v); } catch (x) { if (x.isDax) return true; throw x; } }, "ISERROR(<값>)", "오류인지", "정보");
  def("IFERROR", 2, 2, false, function (a, e) {
    try { const v = this.evalScalar(a[0], e); if (typeof v === "number" && !isFinite(v)) return this.evalScalar(a[1], e); return v; }
    catch (x) { if (x.isDax) return this.evalScalar(a[1], e); throw x; }
  }, "IFERROR(<값>, <오류일 때>)", "오류면 대체값", "논리");
  def("COALESCE", 2, -1, false, function (a, e) { for (const x of a) { const v = this.evalScalar(x, e); if (!isBlank(v)) return v; } return null; }, "COALESCE(<값1>, <값2>, ...)", "처음으로 비어 있지 않은 값", "논리");

  // 수학
  def("DIVIDE", 2, 3, false, function (a, e) {
    const x = this.evalScalar(a[0], e), y = this.evalScalar(a[1], e);
    const d = isBlank(y) ? 0 : this.num(y);
    if (d === 0) return a[2] ? this.evalScalar(a[2], e) : null;
    if (isBlank(x)) return null;
    return this.num(x) / d;
  }, "DIVIDE(<분자>, <분모>, [0으로 나눌 때 값])", "0으로 나누기를 안전하게 처리하는 나눗셈", "수학");
  const m1 = (name, f, desc) => def(name, 1, 1, false, function (a, e) { const v = this.evalScalar(a[0], e); return isBlank(v) ? null : f(this.num(v)); }, `${name}(<숫자>)`, desc, "수학");
  m1("ABS", Math.abs, "절댓값"); m1("INT", Math.floor, "내림한 정수"); m1("SQRT", Math.sqrt, "제곱근"); m1("EXP", Math.exp, "e의 거듭제곱");
  m1("LN", Math.log, "자연로그"); m1("LOG10", Math.log10, "상용로그"); m1("SIGN", Math.sign, "부호"); m1("EVEN", (x) => 2 * Math.ceil(x / 2), "짝수로 올림"); m1("ODD", (x) => 2 * Math.ceil((x + 1) / 2) - 1, "홀수로 올림");
  const rnd = (x, n, mode) => { const p = Math.pow(10, n); const y = x * p; const r = mode === 0 ? Math.sign(y) * Math.round(Math.abs(y) + 1e-9) : mode > 0 ? Math.sign(y) * Math.ceil(Math.abs(y) - 1e-9) : Math.trunc(y); return r / p; };
  def("ROUND", 1, 2, false, function (a, e) { const v = this.evalScalar(a[0], e); if (isBlank(v)) return null; return rnd(this.num(v), a[1] ? this.num(this.evalScalar(a[1], e)) : 0, 0); }, "ROUND(<숫자>, <자릿수>)", "반올림", "수학");
  def("ROUNDUP", 1, 2, false, function (a, e) { const v = this.evalScalar(a[0], e); if (isBlank(v)) return null; return rnd(this.num(v), a[1] ? this.num(this.evalScalar(a[1], e)) : 0, 1); }, "ROUNDUP(<숫자>, <자릿수>)", "올림", "수학");
  def("ROUNDDOWN", 1, 2, false, function (a, e) { const v = this.evalScalar(a[0], e); if (isBlank(v)) return null; return rnd(this.num(v), a[1] ? this.num(this.evalScalar(a[1], e)) : 0, -1); }, "ROUNDDOWN(<숫자>, <자릿수>)", "내림", "수학");
  def("TRUNC", 1, 2, false, function (a, e) { const v = this.evalScalar(a[0], e); if (isBlank(v)) return null; return rnd(this.num(v), a[1] ? this.num(this.evalScalar(a[1], e)) : 0, -1); }, "TRUNC(<숫자>, [자릿수])", "소수점 이하 버림", "수학");
  def("MOD", 2, 2, false, function (a, e) { const x = this.num(this.evalScalar(a[0], e)), y = this.num(this.evalScalar(a[1], e)); return x - y * Math.floor(x / y); }, "MOD(<숫자>, <나눌 수>)", "나머지", "수학");
  def("QUOTIENT", 2, 2, false, function (a, e) { return Math.trunc(this.num(this.evalScalar(a[0], e)) / this.num(this.evalScalar(a[1], e))); }, "QUOTIENT(<분자>, <분모>)", "몫", "수학");
  def("POWER", 2, 2, false, function (a, e) { return Math.pow(this.num(this.evalScalar(a[0], e)), this.num(this.evalScalar(a[1], e))); }, "POWER(<숫자>, <지수>)", "거듭제곱", "수학");
  def("CEILING", 2, 2, false, function (a, e) { const x = this.num(this.evalScalar(a[0], e)), s = this.num(this.evalScalar(a[1], e)); return Math.ceil(x / s) * s; }, "CEILING(<숫자>, <배수>)", "배수로 올림", "수학");
  def("FLOOR", 2, 2, false, function (a, e) { const x = this.num(this.evalScalar(a[0], e)), s = this.num(this.evalScalar(a[1], e)); return Math.floor(x / s) * s; }, "FLOOR(<숫자>, <배수>)", "배수로 내림", "수학");
  def("PI", 0, 0, false, () => Math.PI, "PI()", "원주율", "수학");
  def("RAND", 0, 0, false, () => Math.random(), "RAND()", "0~1 난수", "수학");
  def("RANDBETWEEN", 2, 2, false, function (a, e) { const x = this.num(this.evalScalar(a[0], e)), y = this.num(this.evalScalar(a[1], e)); return x + Math.floor(Math.random() * (y - x + 1)); }, "RANDBETWEEN(<최소>, <최대>)", "정수 난수", "수학");

  // 텍스트
  const txt = (e, n, env) => toText(e.evalScalar(n, env));
  def("CONCATENATE", 2, 2, false, function (a, e) { return txt(this, a[0], e) + txt(this, a[1], e); }, "CONCATENATE(<텍스트1>, <텍스트2>)", "두 텍스트 연결 (3개 이상은 & 사용)", "텍스트");
  def("LEFT", 1, 2, false, function (a, e) { const s = txt(this, a[0], e); return s.slice(0, a[1] ? this.num(this.evalScalar(a[1], e)) : 1); }, "LEFT(<텍스트>, <글자수>)", "왼쪽에서 n글자", "텍스트");
  def("RIGHT", 1, 2, false, function (a, e) { const s = txt(this, a[0], e); const n = a[1] ? this.num(this.evalScalar(a[1], e)) : 1; return n ? s.slice(-n) : ""; }, "RIGHT(<텍스트>, <글자수>)", "오른쪽에서 n글자", "텍스트");
  def("MID", 3, 3, false, function (a, e) { const s = txt(this, a[0], e); const st = this.num(this.evalScalar(a[1], e)); return s.substr(st - 1, this.num(this.evalScalar(a[2], e))); }, "MID(<텍스트>, <시작위치>, <글자수>)", "가운데 글자", "텍스트");
  def("LEN", 1, 1, false, function (a, e) { return txt(this, a[0], e).length; }, "LEN(<텍스트>)", "글자 수", "텍스트");
  def("UPPER", 1, 1, false, function (a, e) { return txt(this, a[0], e).toUpperCase(); }, "UPPER(<텍스트>)", "대문자", "텍스트");
  def("LOWER", 1, 1, false, function (a, e) { return txt(this, a[0], e).toLowerCase(); }, "LOWER(<텍스트>)", "소문자", "텍스트");
  def("TRIM", 1, 1, false, function (a, e) { return txt(this, a[0], e).trim().replace(/\s+/g, " "); }, "TRIM(<텍스트>)", "앞뒤·중복 공백 제거", "텍스트");
  def("REPT", 2, 2, false, function (a, e) { return txt(this, a[0], e).repeat(Math.max(0, this.num(this.evalScalar(a[1], e)))); }, "REPT(<텍스트>, <횟수>)", "반복", "텍스트");
  def("SUBSTITUTE", 3, 4, false, function (a, e) { const s = txt(this, a[0], e), o = txt(this, a[1], e), n = txt(this, a[2], e); return o ? s.split(o).join(n) : s; }, "SUBSTITUTE(<텍스트>, <찾을 텍스트>, <바꿀 텍스트>)", "텍스트 바꾸기", "텍스트");
  def("REPLACE", 4, 4, false, function (a, e) { const s = txt(this, a[0], e), st = this.num(this.evalScalar(a[1], e)), n = this.num(this.evalScalar(a[2], e)); return s.slice(0, st - 1) + txt(this, a[3], e) + s.slice(st - 1 + n); }, "REPLACE(<텍스트>, <시작>, <글자수>, <새 텍스트>)", "위치로 바꾸기", "텍스트");
  function findFn(name, ci) {
    def(name, 2, 4, false, function (a, e, node) {
      let f = txt(this, a[0], e), s = txt(this, a[1], e);
      const st = a[2] && a[2].type !== "empty" ? this.num(this.evalScalar(a[2], e)) : 1;
      if (ci) { f = f.toLowerCase(); s = s.toLowerCase(); }
      const i = s.indexOf(f, st - 1);
      if (i < 0) { if (a[3]) return this.evalScalar(a[3], e); throw this.err(`${name}: 찾는 텍스트가 없습니다. 네 번째 인수(못 찾을 때 값)를 지정하세요.`, node); }
      return i + 1;
    }, `${name}(<찾을 텍스트>, <대상 텍스트>, [시작], [못 찾을 때])`, ci ? "대소문자 구분 없이 위치 찾기" : "대소문자 구분해 위치 찾기", "텍스트");
  }
  findFn("SEARCH", true); findFn("FIND", false);
  def("CONTAINSSTRING", 2, 2, false, function (a, e) { return txt(this, a[0], e).toLowerCase().includes(txt(this, a[1], e).toLowerCase()); }, "CONTAINSSTRING(<텍스트>, <찾을 텍스트>)", "포함 여부", "텍스트");
  def("VALUE", 1, 1, false, function (a, e) { return this.num(txt(this, a[0], e), a[0]); }, "VALUE(<텍스트>)", "텍스트를 숫자로", "텍스트");
  def("FORMAT", 2, 3, false, function (a, e) { const v = this.evalScalar(a[0], e); if (isBlank(v)) return ""; return formatValue(v, txt(this, a[1], e)); }, 'FORMAT(<값>, <서식>)  예: "#,##0", "0.0%", "yyyy-mm"', "값을 서식 있는 텍스트로", "텍스트");
  def("FIXED", 1, 3, false, function (a, e) { const v = this.num(this.evalScalar(a[0], e)); const d = a[1] ? this.num(this.evalScalar(a[1], e)) : 2; const nc = a[2] ? toBool(this.evalScalar(a[2], e)) : false; return fmtNumber(v, (nc ? "0" : "#,##0") + (d > 0 ? "." + "0".repeat(d) : "")); }, "FIXED(<숫자>, [자릿수], [쉼표 생략])", "고정 소수 텍스트", "텍스트");
  def("UNICHAR", 1, 1, false, function (a, e) { return String.fromCodePoint(this.num(this.evalScalar(a[0], e))); }, "UNICHAR(<코드>)", "유니코드 문자 (예: UNICHAR(9650) ▲)", "텍스트");
  def("EXACT", 2, 2, false, function (a, e) { return txt(this, a[0], e) === txt(this, a[1], e); }, "EXACT(<텍스트1>, <텍스트2>)", "대소문자까지 같은지", "텍스트");

  // 날짜
  const dt = (eng, n, env, node) => {
    const v = eng.evalScalar(n, env);
    if (isBlank(v)) return null;
    if (isDate(v)) return v;
    if (typeof v === "number") return fromSerial(v);
    const p = Date.parse(String(v).replace(/\./g, "-"));
    if (isNaN(p)) throw eng.err(`"${v}"을(를) 날짜로 바꿀 수 없습니다.`, node);
    const d = new Date(p); return mk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  };
  def("DATE", 3, 3, false, function (a, e) {
    const y = this.num(this.evalScalar(a[0], e)), m = this.num(this.evalScalar(a[1], e)), d = this.num(this.evalScalar(a[2], e));
    return new Date(Date.UTC(y, m - 1, d));
  }, "DATE(<연>, <월>, <일>)", "날짜 만들기", "날짜");
  def("DATEVALUE", 1, 1, false, function (a, e) { return dt(this, a[0], e, a[0]); }, "DATEVALUE(<텍스트>)", "텍스트를 날짜로", "날짜");
  const dpart = (name, f, desc) => def(name, 1, 1, false, function (a, e) { const d = dt(this, a[0], e, a[0]); return d ? f(d) : null; }, `${name}(<날짜>)`, desc, "날짜");
  dpart("YEAR", (d) => d.getUTCFullYear(), "연도");
  dpart("MONTH", (d) => d.getUTCMonth() + 1, "월(1~12)");
  dpart("DAY", (d) => d.getUTCDate(), "일");
  dpart("QUARTER", (d) => Math.ceil((d.getUTCMonth() + 1) / 3), "분기(1~4)");
  def("WEEKDAY", 1, 2, false, function (a, e) {
    const d = dt(this, a[0], e, a[0]); if (!d) return null;
    const t = a[1] ? this.num(this.evalScalar(a[1], e)) : 1, w = d.getUTCDay();
    return t === 2 ? (w === 0 ? 7 : w) : t === 3 ? (w + 6) % 7 : w + 1;
  }, "WEEKDAY(<날짜>, [반환유형])", "요일 번호 (기본 1: 일=1 … 토=7, 2: 월=1)", "날짜");
  def("WEEKNUM", 1, 2, false, function (a, e) {
    const d = dt(this, a[0], e, a[0]); if (!d) return null;
    const t = a[1] ? this.num(this.evalScalar(a[1], e)) : 1;
    const jan1 = mk(d.getUTCFullYear(), 1, 1), off = t === 2 ? (jan1.getUTCDay() + 6) % 7 : jan1.getUTCDay();
    return Math.floor(((d - jan1) / DAY + off) / 7) + 1;
  }, "WEEKNUM(<날짜>, [유형])", "연중 주 번호", "날짜");
  def("TODAY", 0, 0, false, () => { const n = new Date(); return mk(n.getFullYear(), n.getMonth() + 1, n.getDate()); }, "TODAY()", "오늘 날짜", "날짜");
  def("NOW", 0, 0, false, () => new Date(), "NOW()", "현재 날짜·시각", "날짜");
  def("EOMONTH", 2, 2, false, function (a, e) { const d = dt(this, a[0], e, a[0]); if (!d) return null; const n = this.num(this.evalScalar(a[1], e)); const x = addMonths(mk(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), n); return mk(x.getUTCFullYear(), x.getUTCMonth() + 1, lastDay(x.getUTCFullYear(), x.getUTCMonth() + 1)); }, "EOMONTH(<날짜>, <개월>)", "n개월 뒤 월말", "날짜");
  def("EDATE", 2, 2, false, function (a, e) { const d = dt(this, a[0], e, a[0]); if (!d) return null; return addMonths(d, this.num(this.evalScalar(a[1], e))); }, "EDATE(<날짜>, <개월>)", "n개월 뒤 같은 날", "날짜");
  def("DATEDIFF", 3, 3, false, function (a, e, node) {
    const d1 = dt(this, a[0], e, a[0]), d2 = dt(this, a[1], e, a[1]);
    if (!d1 || !d2) return null;
    const u = this.kw(a[2]);
    const [y1, m1, dd1] = ymd(d1), [y2, m2] = ymd(d2);
    switch (u) {
      case "DAY": return Math.round((d2 - d1) / DAY);
      case "WEEK": return Math.floor((Math.round((d2 - d1) / DAY) + d1.getUTCDay()) / 7);
      case "MONTH": return (y2 - y1) * 12 + (m2 - m1);
      case "QUARTER": return (y2 * 4 + Math.floor((m2 - 1) / 3)) - (y1 * 4 + Math.floor((m1 - 1) / 3));
      case "YEAR": return y2 - y1;
    }
    void dd1;
    throw this.err("DATEDIFF의 세 번째 인수는 DAY, WEEK, MONTH, QUARTER, YEAR 중 하나입니다.", node);
  }, "DATEDIFF(<시작일>, <종료일>, <단위>)", "두 날짜 사이 간격", "날짜");
  def("CALENDAR", 2, 2, true, function (a, e) {
    const s = dt(this, a[0], e, a[0]), t = dt(this, a[1], e, a[1]);
    const rows = [];
    for (let x = s.getTime(); x <= t.getTime(); x += DAY) rows.push({ vals: [new Date(x)] });
    return makeTV([{ name: "Date", table: null, col: null }], rows);
  }, "CALENDAR(<시작일>, <종료일>)", "날짜 목록 테이블 (열 이름 [Date])", "날짜");
  def("CALENDARAUTO", 0, 1, true, function () {
    let mn = Infinity, mx = -Infinity;
    for (const t of this.model.tables.values()) for (const c of t.columns) if (c.type === "date") for (const r of t.rows) { const v = r[c.name]; if (isDate(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }
    const s = mk(new Date(mn).getUTCFullYear(), 1, 1), t = mk(new Date(mx).getUTCFullYear(), 12, 31);
    const rows = [];
    for (let x = s.getTime(); x <= t.getTime(); x += DAY) rows.push({ vals: [new Date(x)] });
    return makeTV([{ name: "Date", table: null, col: null }], rows);
  }, "CALENDARAUTO()", "모델의 날짜 범위로 날짜 테이블", "날짜");

  // 시간 인텔리전스
  function yearEndOf(eng, node, env) {
    if (!node || node.type === "empty") return null;
    const v = eng.evalScalar(node, env);
    const m = /^\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*$/.exec(String(v));
    if (!m) throw eng.err(`연말일은 "6-30"처럼 "월-일" 텍스트로 씁니다.`, node);
    return [+m[1], +m[2]];
  }
  function ytdStartOf(last, ye) {
    const [y] = ymd(last);
    if (!ye) return mk(y, 1, 1);
    const endThis = mk(y, ye[0], Math.min(ye[1], lastDay(y, ye[0])));
    const base = last > endThis ? endThis : mk(y - 1, ye[0], Math.min(ye[1], lastDay(y - 1, ye[0])));
    return new Date(base.getTime() + DAY);
  }
  function tiTotal(name, unit) {
    def(name, 2, 4, false, function (a, e) {
      const ref = this.dateRef(a[1], e, name);
      const vis = this.visibleDates(ref, e);
      if (!vis.length) return null;
      let filt = a[2] && a[2].type !== "empty" ? a[2] : null, ye = null;
      if (unit === "YEAR") {
        if (filt && filt.type === "lit" && typeof filt.v === "string") { ye = yearEndOf(this, filt, e); filt = null; }
        if (a[3]) ye = yearEndOf(this, a[3], e);
      }
      const last = vis[vis.length - 1], [y, m] = ymd(last);
      const start = unit === "YEAR" ? ytdStartOf(last, ye) : unit === "QUARTER" ? mk(y, Math.floor((m - 1) / 3) * 3 + 1, 1) : mk(y, m, 1);
      const dates = this.allDates(ref).filter((d) => d >= start && d <= last);
      const fake = { type: "__tv", tv: this.datesTV(ref, dates) };
      return this.evalCalcWith(a[0], [fake].concat(filt ? [filt] : []), e);
    }, unit === "YEAR" ? `${name}(<식>, <날짜 열>, [필터], [연말일 "6-30"])` : `${name}(<식>, <날짜 열>, [필터])`, unit === "YEAR" ? "연간 누계(YTD)" : unit === "QUARTER" ? "분기 누계(QTD)" : "월간 누계(MTD)", "시간 인텔리전스");
  }
  tiTotal("TOTALYTD", "YEAR"); tiTotal("TOTALQTD", "QUARTER"); tiTotal("TOTALMTD", "MONTH");
  Engine.prototype.evalCalcWith = function (exprNode, filterNodes, env) {
    const ctx = this.calcCtx(filterNodes, env);
    return this.evalScalar(exprNode, { ctx, rows: [], vars: env.vars });
  };
  // __tv 노드 지원 (내부용)
  const _evalTable = Engine.prototype.evalTable;
  Engine.prototype.evalTable = function (node, env) { if (node.type === "__tv") return node.tv; return _evalTable.call(this, node, env); };
  const _filterFromArg = Engine.prototype.filterFromArg;
  Engine.prototype.filterFromArg = function (a, env) { if (a.type === "__tv") return this.filterFromTable(a.tv, a); return _filterFromArg.call(this, a, env); };

  function tiTable(name, min, max, impl, sig, desc) {
    def(name, min, max, true, function (a, e, node) {
      const ref = this.dateRef(a[0], e, name);
      return this.datesTV(ref, impl.call(this, ref, this.visibleDates(ref, e), a, e, node));
    }, sig, desc, "시간 인텔리전스");
  }
  function ytdLike(unit) {
    return function (ref, vis) {
      if (!vis.length) return [];
      const last = vis[vis.length - 1], [y, m] = ymd(last);
      const start = unit === "YEAR" ? mk(y, 1, 1) : unit === "QUARTER" ? mk(y, Math.floor((m - 1) / 3) * 3 + 1, 1) : mk(y, m, 1);
      return this.allDates(ref).filter((d) => d >= start && d <= last);
    };
  }
  tiTable("DATESYTD", 1, 2, function (ref, vis, a, e) {
    if (!vis.length) return [];
    const last = vis[vis.length - 1], start = ytdStartOf(last, yearEndOf(this, a[1], e));
    return this.allDates(ref).filter((d) => d >= start && d <= last);
  }, "DATESYTD(<날짜 열>, [연말일])", "연초(또는 회계연도 시작)부터 현재까지의 날짜");
  tiTable("DATESQTD", 1, 1, ytdLike("QUARTER"), "DATESQTD(<날짜 열>)", "분기 초부터 현재까지");
  tiTable("DATESMTD", 1, 1, ytdLike("MONTH"), "DATESMTD(<날짜 열>)", "월초부터 현재까지");
  tiTable("SAMEPERIODLASTYEAR", 1, 1, function (ref, vis) { return this.shiftDates(ref, vis, -1, "YEAR"); }, "SAMEPERIODLASTYEAR(<날짜 열>)", "1년 전 같은 기간");
  tiTable("DATEADD", 3, 3, function (ref, vis, a, e) { return this.shiftDates(ref, vis, this.num(this.evalScalar(a[1], e)), this.kw(a[2])); }, "DATEADD(<날짜 열>, <개수>, <DAY|MONTH|QUARTER|YEAR>)", "기간을 앞뒤로 이동");
  tiTable("PARALLELPERIOD", 3, 3, function (ref, vis, a, e) {
    if (!vis.length) return [];
    const n = this.num(this.evalScalar(a[1], e)), u = String(this.kw(a[2]));
    const months = u === "MONTH" ? n : u === "QUARTER" ? 3 * n : u === "YEAR" ? 12 * n : null;
    if (months === null) throw new DaxError("PARALLELPERIOD의 단위는 MONTH, QUARTER, YEAR 중 하나입니다.");
    const per = u === "MONTH" ? 1 : u === "QUARTER" ? 3 : 12;
    const [y0, m0] = ymd(vis[0]), [y1, m1] = ymd(vis[vis.length - 1]);
    const k0 = y0 * 12 + (m0 - 1) - ((m0 - 1) % per) + months;
    const k1 = y1 * 12 + (m1 - 1) - ((m1 - 1) % per) + per - 1 + months;
    const s = mk(Math.floor(k0 / 12), k0 % 12 + 1, 1), ey = Math.floor(k1 / 12), em = k1 % 12 + 1, t = mk(ey, em, lastDay(ey, em));
    return this.allDates(ref).filter((d) => d >= s && d <= t);
  }, "PARALLELPERIOD(<날짜 열>, <개수>, <MONTH|QUARTER|YEAR>)", "이동한 기간 전체(월·분기·연 단위)");
  const prevNext = (name, unit, off, useLast) => tiTable(name, 1, 1, function (ref, vis) { if (!vis.length) return []; return this.periodRange(ref, useLast ? vis[vis.length - 1] : vis[0], unit, off); }, `${name}(<날짜 열>)`, (off < 0 ? "이전 " : "다음 ") + { DAY: "일", MONTH: "달", QUARTER: "분기", YEAR: "해" }[unit] + " 전체");
  prevNext("PREVIOUSDAY", "DAY", -1, false); prevNext("PREVIOUSMONTH", "MONTH", -1, false); prevNext("PREVIOUSQUARTER", "QUARTER", -1, false); prevNext("PREVIOUSYEAR", "YEAR", -1, true);
  prevNext("NEXTDAY", "DAY", 1, true); prevNext("NEXTMONTH", "MONTH", 1, true); prevNext("NEXTQUARTER", "QUARTER", 1, true); prevNext("NEXTYEAR", "YEAR", 1, true);
  tiTable("DATESBETWEEN", 3, 3, function (ref, vis, a, e) {
    const s = a[1].type === "empty" ? null : dt(this, a[1], e, a[1]), t = a[2].type === "empty" ? null : dt(this, a[2], e, a[2]);
    return this.allDates(ref).filter((d) => (!s || d >= s) && (!t || d <= t));
  }, "DATESBETWEEN(<날짜 열>, <시작일>, <종료일>)", "두 날짜 사이 날짜");
  tiTable("DATESINPERIOD", 4, 4, function (ref, vis, a, e) {
    const s = dt(this, a[1], e, a[1]); if (!s) return [];
    const n = this.num(this.evalScalar(a[2], e)), u = String(this.kw(a[3]));
    let other;
    if (u === "DAY") other = new Date(s.getTime() + n * DAY);
    else other = addMonths(s, (u === "MONTH" ? 1 : u === "QUARTER" ? 3 : 12) * n);
    const lo = n < 0 ? new Date(other.getTime() + DAY) : s, hi = n < 0 ? s : new Date(other.getTime() - DAY);
    return this.allDates(ref).filter((d) => d >= lo && d <= hi);
  }, "DATESINPERIOD(<날짜 열>, <시작일>, <개수>, <단위>)", "시작일부터 n기간 (음수면 과거로)");
  tiTable("FIRSTDATE", 1, 1, function (ref, vis) { return vis.length ? [vis[0]] : []; }, "FIRSTDATE(<날짜 열>)", "보이는 첫 날짜");
  tiTable("LASTDATE", 1, 1, function (ref, vis) { return vis.length ? [vis[vis.length - 1]] : []; }, "LASTDATE(<날짜 열>)", "보이는 마지막 날짜");
  const edge = (name, unit, first) => tiTable(name, 1, 1, function (ref, vis) { if (!vis.length) return []; const r = this.periodRange(ref, first ? vis[0] : vis[vis.length - 1], unit, 0); return r.length ? [first ? r[0] : r[r.length - 1]] : []; }, `${name}(<날짜 열>)`, (first ? "시작" : "마지막") + " 날짜");
  edge("STARTOFMONTH", "MONTH", true); edge("ENDOFMONTH", "MONTH", false); edge("STARTOFQUARTER", "QUARTER", true); edge("ENDOFQUARTER", "QUARTER", false); edge("STARTOFYEAR", "YEAR", true); edge("ENDOFYEAR", "YEAR", false);

  // 테이블 함수
  def("ADDCOLUMNS", 3, -1, true, function (a, e, node) {
    const tv = this.evalTable(a[0], e);
    if ((a.length - 1) % 2) throw this.err('ADDCOLUMNS는 "열 이름", 식 쌍으로 써야 합니다.', node);
    const names = [], exprs = [];
    for (let i = 1; i < a.length; i += 2) { names.push(this.strArg(a[i], "ADDCOLUMNS")); exprs.push(a[i + 1]); }
    const cols = tv.cols.concat(names.map((n) => ({ name: n, table: null, col: null })));
    const rows = tv.rows.map((row) => {
      const env2 = { ctx: e.ctx, rows: e.rows.concat([{ tv, row }]), vars: e.vars };
      return { vals: row.vals.concat(exprs.map((x) => this.evalScalar(x, env2))), rid: row.rid };
    });
    return makeTV(cols, rows, tv.base);
  }, 'ADDCOLUMNS(<테이블>, "새 열", <식>, ...)', "테이블에 계산 열 추가", "테이블");
  def("SELECTCOLUMNS", 3, -1, true, function (a, e, node) {
    const tv = this.evalTable(a[0], e);
    if ((a.length - 1) % 2) throw this.err('SELECTCOLUMNS는 "열 이름", 식 쌍으로 써야 합니다.', node);
    const cols = [], exprs = [];
    for (let i = 1; i < a.length; i += 2) {
      const n = this.strArg(a[i], "SELECTCOLUMNS"), x = a[i + 1];
      exprs.push(x);
      if (x.type === "col") { const r = this.model.column(x.table, x.col); cols.push({ name: n, table: r.table, col: r.col }); }
      else cols.push({ name: n, table: null, col: null });
    }
    const rows = tv.rows.map((row) => { const env2 = { ctx: e.ctx, rows: e.rows.concat([{ tv, row }]), vars: e.vars }; return { vals: exprs.map((x) => this.evalScalar(x, env2)) }; });
    return makeTV(cols, rows);
  }, 'SELECTCOLUMNS(<테이블>, "열 이름", <식>, ...)', "원하는 열만 골라 새 테이블", "테이블");
  Engine.prototype.strArg = function (node, fname) {
    if (node.type === "lit" && typeof node.v === "string") return node.v;
    throw this.err(`${fname}의 새 열 이름은 큰따옴표로 감싼 텍스트여야 합니다. (예: "매출")`, node);
  };
  def("SUMMARIZE", 2, -1, true, function (a, e, node) {
    const tv = this.evalTable(a[0], e);
    const groups = [];
    let i = 1;
    for (; i < a.length && a[i].type === "col"; i++) groups.push(this.model.column(a[i].table, a[i].col));
    const names = [], exprs = [];
    for (; i < a.length; i += 2) {
      if (!a[i + 1]) throw this.err('SUMMARIZE의 추가 열은 "이름", 식 쌍이어야 합니다.', node);
      names.push(this.strArg(a[i], "SUMMARIZE")); exprs.push(a[i + 1]);
    }
    const seen = new Map();
    for (const row of tv.rows) {
      const vals = groups.map((g) => {
        const ix = tv.idx.get(g.key);
        if (ix !== undefined) return row.vals[ix];
        if (tv.base && row.rid !== undefined) return this.model.cellValue(tv.base, row.rid, g, e.ctx);
        throw this.err(`SUMMARIZE: ${g.table}[${g.col}]은(는) 이 테이블과 관계로 연결되어 있지 않습니다.`, node);
      });
      const k = tupleKey(vals);
      if (!seen.has(k)) seen.set(k, { vals });
    }
    const gcols = groups.map((g) => ({ name: g.col, table: g.table, col: g.col }));
    const gtv = makeTV(gcols, [...seen.values()]);
    const rows = gtv.rows.map((row) => {
      if (!exprs.length) return row;
      const ctx = this.transition({ ctx: e.ctx, rows: [{ tv: gtv, row }], vars: e.vars });
      return { vals: row.vals.concat(exprs.map((x) => this.evalScalar(x, { ctx, rows: [], vars: e.vars }))) };
    });
    return makeTV(gcols.concat(names.map((n) => ({ name: n, table: null, col: null }))), rows);
  }, 'SUMMARIZE(<테이블>, <그룹 열>, ..., ["이름", <식>])', "그룹별 요약 테이블", "테이블");
  def("SUMMARIZECOLUMNS", 1, -1, true, function (a, e, node) {
    const groups = [];
    let i = 0;
    for (; i < a.length && a[i].type === "col"; i++) groups.push(this.model.column(a[i].table, a[i].col));
    const fargs = [];
    for (; i < a.length && !(a[i].type === "lit" && typeof a[i].v === "string"); i++) fargs.push(a[i]);
    const names = [], exprs = [];
    for (; i < a.length; i += 2) { names.push(this.strArg(a[i], "SUMMARIZECOLUMNS")); if (!a[i + 1]) throw this.err("이름 뒤에 식이 필요합니다.", node); exprs.push(a[i + 1]); }
    const ctx0 = fargs.length ? this.calcCtx(fargs, e) : e.ctx;
    // 테이블별 고유 조합 → 교차 곱
    const byT = new Map();
    groups.forEach((g) => { if (!byT.has(L(g.table))) byT.set(L(g.table), []); byT.get(L(g.table)).push(g); });
    let combos = [{ vals: [], refs: [] }];
    for (const refs of byT.values()) {
      const tv = this.distinctTV(refs, ctx0);
      const nc = [];
      combos.forEach((c) => tv.rows.forEach((r) => nc.push({ vals: c.vals.concat(r.vals), refs: c.refs.concat(refs) })));
      combos = nc;
    }
    const orderRefs = combos.length ? combos[0].refs : groups;
    const gcols = orderRefs.map((g) => ({ name: g.col, table: g.table, col: g.col }));
    const gtv = makeTV(gcols, combos.map((c) => ({ vals: c.vals })));
    const rows = [];
    for (const row of gtv.rows) {
      if (!exprs.length) { rows.push(row); continue; }
      const ctx = this.transition({ ctx: ctx0, rows: [{ tv: gtv, row }], vars: e.vars });
      const vs = exprs.map((x) => this.evalScalar(x, { ctx, rows: [], vars: e.vars }));
      if (vs.every(isBlank)) continue;
      rows.push({ vals: row.vals.concat(vs) });
    }
    return makeTV(gcols.concat(names.map((n) => ({ name: n, table: null, col: null }))), rows);
  }, 'SUMMARIZECOLUMNS(<그룹 열>, ..., ["이름", <식>])', "그룹별 요약 (값이 빈 조합 제외)", "테이블");
  def("TOPN", 3, -1, true, function (a, e) {
    const n = this.num(this.evalScalar(a[0], e));
    const tv = this.evalTable(a[1], e);
    const keys = [];
    for (let i = 2; i < a.length; i += 2) keys.push({ x: a[i], desc: !(a[i + 1] && (this.kw(a[i + 1]) === "ASC" || this.kw(a[i + 1]) === 1)) });
    const scored = tv.rows.map((row) => ({ row, ks: keys.map((k) => this.evalScalar(k.x, { ctx: e.ctx, rows: e.rows.concat([{ tv, row }]), vars: e.vars })) }));
    scored.sort((p, q) => { for (let i = 0; i < keys.length; i++) { const c = this.compare(p.ks[i], q.ks[i]); if (c) return keys[i].desc ? -c : c; } return 0; });
    if (n <= 0) return makeTV(tv.cols, [], tv.base);
    let cut = Math.min(n, scored.length);
    while (cut < scored.length && keys.every((k, i) => this.compare(scored[cut].ks[i], scored[cut - 1].ks[i]) === 0)) cut++;
    return makeTV(tv.cols, scored.slice(0, cut).map((s) => s.row), tv.base);
  }, "TOPN(<개수>, <테이블>, <정렬식>, [ASC|DESC])", "상위 N개 행 (동점 포함)", "테이블");
  def("GENERATESERIES", 2, 3, true, function (a, e) {
    const s = this.num(this.evalScalar(a[0], e)), t = this.num(this.evalScalar(a[1], e)), st = a[2] ? this.num(this.evalScalar(a[2], e)) : 1;
    const rows = [];
    for (let x = s, k = 0; x <= t + 1e-9 && k < 100000; k++, x = Number((s + k * st).toFixed(10))) rows.push({ vals: [x] });
    return makeTV([{ name: "Value", table: null, col: null }], rows);
  }, "GENERATESERIES(<시작>, <끝>, [간격])", "숫자 목록 테이블 (숫자 범위 매개변수가 쓰는 함수)", "테이블");
  def("ROW", 2, -1, true, function (a, e) {
    const cols = [], vals = [];
    for (let i = 0; i < a.length; i += 2) { cols.push({ name: this.strArg(a[i], "ROW"), table: null, col: null }); vals.push(this.evalScalar(a[i + 1], e)); }
    return makeTV(cols, [{ vals }]);
  }, 'ROW("이름", <식>, ...)', "한 행짜리 테이블", "테이블");
  def("CROSSJOIN", 2, -1, true, function (a, e) {
    let tv = this.evalTable(a[0], e);
    for (let i = 1; i < a.length; i++) {
      const t2 = this.evalTable(a[i], e), rows = [];
      tv.rows.forEach((r) => t2.rows.forEach((s) => rows.push({ vals: r.vals.concat(s.vals) })));
      tv = makeTV(tv.cols.concat(t2.cols), rows);
    }
    return tv;
  }, "CROSSJOIN(<테이블1>, <테이블2>, ...)", "모든 조합", "테이블");
  def("UNION", 2, -1, true, function (a, e) {
    const tvs = a.map((x) => this.evalTable(x, e));
    return makeTV(tvs[0].cols.map((c) => ({ ...c })), tvs.flatMap((t) => t.rows.map((r) => ({ vals: r.vals }))));
  }, "UNION(<테이블1>, <테이블2>, ...)", "행 이어 붙이기", "테이블");
  const setOp = (name, keepIn) => def(name, 2, 2, true, function (a, e) {
    const t1 = this.evalTable(a[0], e), t2 = this.evalTable(a[1], e);
    const s = new Set(t2.rows.map((r) => tupleKey(r.vals)));
    return makeTV(t1.cols, t1.rows.filter((r) => s.has(tupleKey(r.vals)) === keepIn), t1.base);
  }, `${name}(<테이블1>, <테이블2>)`, keepIn ? "두 테이블에 모두 있는 행" : "첫 테이블에만 있는 행", "테이블");
  setOp("INTERSECT", true); setOp("EXCEPT", false);
  def("CONTAINS", 3, -1, false, function (a, e) {
    const tv = this.evalTable(a[0], e);
    const pairs = [];
    for (let i = 1; i < a.length; i += 2) pairs.push({ i: tv.idx.get(this.colArg(a[i], "CONTAINS").key), v: this.evalScalar(a[i + 1], e) });
    return tv.rows.some((r) => pairs.every((p) => keyOf(r.vals[p.i]) === keyOf(p.v)));
  }, "CONTAINS(<테이블>, <열>, <값>, ...)", "해당 값의 행이 있는지", "정보");

  // ───────────────────────── 공개 API ─────────────────────────
  function filtersFromSpec(model, spec) {
    // spec: [{table, col, values:[...]}]
    return (spec || []).filter((s) => s.values && s.values.length).map((s) => {
      const ref = model.column(s.table, s.col);
      return colFilter([ref], new Set(s.values.map(keyOf)));
    });
  }

  global.DAX = {
    DaxError, parse, lex, Model, Engine, Ctx, makeTV, keyOf, formatValue, fmtNumber, fmtDate, isBlank, isDate,
    filtersFromSpec, colFilter, FN,
    functionList() { return Object.entries(FN).filter(([n]) => !n.startsWith("_")).map(([name, f]) => ({ name, sig: f.sig, desc: f.desc, cat: f.cat, table: f.table })); },
  };
  if (typeof module !== "undefined") module.exports = global.DAX;
})(typeof window !== "undefined" ? window : globalThis);
