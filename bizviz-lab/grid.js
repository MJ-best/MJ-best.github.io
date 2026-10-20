/* 행렬(시각적 개체) 시뮬레이션: 행·열·슬라이서 필터 컨텍스트를 만들고 측정값을 셀마다 계산 */
(function (global) {
  const DAX = global.DAX;

  function parseRef(model, key) {
    if (!key) return null;
    const m = /^(.+)\[(.+)\]$/.exec(key);
    return model.column(m[1], m[2]);
  }

  // "이름 = 식" 분리
  function splitDef(text) {
    let depth = 0, q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "[") { depth++; continue; }
      if (c === "]") { depth--; continue; }
      if (c === "(" ) return { name: null, expr: text };
      if (c === "=" && depth === 0) {
        if (text[i + 1] === "=" || "<>!:".includes(text[i - 1] || "")) {
          if (text[i - 1] === ":") { const left = text.slice(0, i - 1).trim(); return check(left, text.slice(i + 1)); }
          return { name: null, expr: text };
        }
        return check(text.slice(0, i).trim(), text.slice(i + 1));
      }
    }
    return { name: null, expr: text };
    function check(left, expr) {
      let name = left;
      const br = /^\[([^\]]+)\]$/.exec(left);
      if (br) name = br[1];
      else if (!/^[\p{L}\p{N}_ .%\-·]+$/u.test(left) || /\[|\]/.test(left)) return { name: null, expr: text };
      if (!name) return { name: null, expr: text };
      return { name: name.trim(), expr: expr.trim() };
    }
  }

  function axisValues(model, ref, ctx) {
    const tbl = model.table(ref.table);
    const vis = model.visibleRows(ref.table, ctx);
    const col = tbl.colMap.get(ref.col.toLowerCase());
    const sortCol = col && col.sortBy ? col.sortBy : ref.col;
    const seen = new Map();
    for (const i of vis) {
      const v = tbl.rows[i][ref.col];
      const k = DAX.keyOf(v);
      if (!seen.has(k)) seen.set(k, { v, s: tbl.rows[i][sortCol] });
    }
    const arr = [...seen.values()];
    arr.sort((a, b) => {
      const x = a.s, y = b.s;
      if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
      if (x instanceof Date) return x - y;
      if (typeof x === "number" && typeof y === "number") return x - y;
      return String(x).localeCompare(String(y), "ko");
    });
    return arr.map((o) => o.v);
  }

  function slicerFilters(model, slicers) {
    return DAX.filtersFromSpec(model, Object.entries(slicers || {}).map(([k, vals]) => {
      const r = parseRef(model, k); return { table: r.table, col: r.col, values: vals };
    }));
  }

  // 행렬 계산
  function computeGrid(model, engine, spec, ast) {
    const outer = new DAX.Ctx(slicerFilters(model, spec.slicers));
    outer.outer = outer;
    const rRef = parseRef(model, spec.rows), cRef = parseRef(model, spec.cols);
    const rowVals = rRef ? axisValues(model, rRef, outer) : [];
    const colVals = cRef ? axisValues(model, cRef, outer) : [];
    const make = (rv, cv, hasR, hasC) => {
      const fs = outer.filters.slice(), scope = [];
      if (hasR) { fs.push(DAX.colFilter([rRef], new Set([DAX.keyOf(rv)]))); scope.push(rRef.key); }
      if (hasC) { fs.push(DAX.colFilter([cRef], new Set([DAX.keyOf(cv)]))); scope.push(cRef.key); }
      return new DAX.Ctx(fs, { outer, scope });
    };
    const ev = (ctx) => engine.runScalar(ast, ctx);
    const res = { rowVals, colVals, rRef, cRef, cells: [], rowTot: [], colTot: [], grand: null, outer, make };
    const rs = rRef ? rowVals : [null], cs = cRef ? colVals : [null];
    rs.forEach((rv, ri) => {
      res.cells[ri] = cs.map((cv) => ev(make(rv, cv, !!rRef, !!cRef)));
      if (rRef && cRef) res.rowTot[ri] = ev(make(rv, null, true, false));
    });
    if (rRef && cRef) res.colTot = colVals.map((cv) => ev(make(null, cv, false, true)));
    res.grand = ev(make(null, null, false, false));
    // 빈 행/열 숨기기 (Power BI 기본 동작)
    const blank = (v) => v === null || v === undefined;
    if (rRef) {
      const keep = res.cells.map((row, i) => row.some((v) => !blank(v)) || (cRef && !blank(res.rowTot[i])));
      res.rowVals = rowVals.filter((_, i) => keep[i]);
      res.cells = res.cells.filter((_, i) => keep[i]);
      res.rowTot = res.rowTot.filter((_, i) => keep[i]);
    }
    if (cRef) {
      const keepC = colVals.map((_, j) => res.cells.some((row) => !blank(row[j])) || !blank(res.colTot[j]));
      res.colVals = colVals.filter((_, j) => keepC[j]);
      res.cells = res.cells.map((row) => row.filter((_, j) => keepC[j]));
      res.colTot = res.colTot.filter((_, j) => keepC[j]);
    }
    return res;
  }

  function computeColumn(model, engine, tableName, ast) {
    const tv = model.baseTV(model.table(tableName).name);
    const ctx = new DAX.Ctx();
    return tv.rows.map((row) => {
      const v = engine.evalScalar(ast, { ctx, rows: [{ tv, row }], vars: new Map() });
      return v;
    });
  }

  function computeTable(model, engine, ast) {
    const v = engine.evalAny(ast, { ctx: new DAX.Ctx(), rows: [], vars: new Map() });
    if (!v || !v.isTable) throw new DAX.DaxError("새 테이블에는 테이블을 돌려주는 식(예: CALENDAR, ADDCOLUMNS, SUMMARIZE, FILTER)이 필요합니다. 값 하나를 계산하려면 '측정값' 모드를 쓰세요.");
    return v;
  }

  // 값 비교
  function same(a, b) {
    const bl = (x) => x === null || x === undefined || x === "";
    if (bl(a) && bl(b)) return true;
    if (bl(a) || bl(b)) return false;
    if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    if (typeof a === "number" && typeof b === "number") {
      if (!isFinite(a) || !isFinite(b)) return Object.is(a, b) || (isNaN(a) && isNaN(b));
      return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
    }
    if (typeof a === "boolean" || typeof b === "boolean") return a === b;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  // 연습문제 채점: 정답식과 사용자식을 같은 조건에서 계산해 비교
  function grade(model, engine, prob, userSrc) {
    const ua = DAX.parse(userSrc), aa = DAX.parse(prob.answer);
    const K = DAX.keyOf;
    const fmt = (v) => DAX.formatValue(v, prob.format || "");
    const diffs = [];
    let total = 0;
    if (prob.mode === "measure") {
      const spec = { rows: prob.rows, cols: prob.cols, slicers: prob.slicers };
      const A = computeGrid(model, engine, spec, aa), U = computeGrid(model, engine, spec, ua);
      const toMap = (G) => {
        const m = new Map();
        G.cells.forEach((row, i) => row.forEach((v, j) => m.set(K(G.rowVals[i]) + "|" + K(G.colVals[j]), { v, label: [G.rowVals[i], G.colVals[j]].filter((x) => x !== undefined && x !== null).map((x) => DAX.formatValue(x)).join(" · ") })));
        G.rowTot.forEach((v, i) => m.set(K(G.rowVals[i]) + "|T", { v, label: DAX.formatValue(G.rowVals[i]) + " · 합계" }));
        G.colTot.forEach((v, j) => m.set("T|" + K(G.colVals[j]), { v, label: "합계 · " + DAX.formatValue(G.colVals[j]) }));
        if (!prob.skipTotal) m.set("T|T", { v: G.grand, label: "총계" });
        return m;
      };
      const am = toMap(A), um = toMap(U);
      const keys = new Set([...am.keys(), ...um.keys()]);
      for (const k of keys) {
        total++;
        const a = am.get(k), u = um.get(k);
        const av = a ? a.v : null, uv = u ? u.v : null;
        if (!same(av, uv)) diffs.push({ where: (a || u).label || "(전체)", expected: fmt(av), got: fmt(uv) });
      }
      return { ok: diffs.length === 0, total, diffs };
    }
    if (prob.mode === "column") {
      const A = computeColumn(model, engine, prob.table, aa), U = computeColumn(model, engine, prob.table, ua);
      const t = model.table(prob.table), first = t.columns[0].name;
      A.forEach((v, i) => { total++; if (!same(v, U[i])) diffs.push({ where: `${first}=${DAX.formatValue(t.rows[i][first])}`, expected: fmt(v), got: fmt(U[i]) }); });
      return { ok: diffs.length === 0, total, diffs };
    }
    // table
    const A = computeTable(model, engine, aa), U = computeTable(model, engine, ua);
    const rowsKey = (tv) => tv.rows.map((r) => r.vals.map((v) => (typeof v === "number" ? K(Math.round(v * 1e6) / 1e6) : K(v))).join("|")).sort();
    if (A.cols.length !== U.cols.length) diffs.push({ where: "열 개수", expected: A.cols.length + "개 (" + A.cols.map((c) => c.name).join(", ") + ")", got: U.cols.length + "개 (" + U.cols.map((c) => c.name).join(", ") + ")" });
    if (A.rows.length !== U.rows.length) diffs.push({ where: "행 개수", expected: A.rows.length + "행", got: U.rows.length + "행" });
    if (!diffs.length) {
      const ak = rowsKey(A), uk = rowsKey(U);
      ak.forEach((k, i) => { if (k !== uk[i] && diffs.length < 50) diffs.push({ where: `${i + 1}번째 행(정렬 후)`, expected: k.replace(/\|/g, ", "), got: (uk[i] || "").replace(/\|/g, ", ") }); });
      const namesA = A.cols.map((c) => c.name.toLowerCase()).join(","), namesU = U.cols.map((c) => c.name.toLowerCase()).join(",");
      if (namesA !== namesU) diffs.push({ where: "열 이름", expected: A.cols.map((c) => c.name).join(", "), got: U.cols.map((c) => c.name).join(", "), soft: true });
    }
    total = A.rows.length;
    return { ok: diffs.filter((d) => !d.soft).length === 0, total, diffs };
  }

  global.BIZVIZ_GRID = { parseRef, splitDef, axisValues, slicerFilters, computeGrid, computeColumn, computeTable, same, grade };
})(typeof window !== "undefined" ? window : globalThis);
