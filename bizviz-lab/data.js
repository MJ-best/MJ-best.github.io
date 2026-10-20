/* 연습용 가상 데이터 모델 — "산길아웃도어" 판매 데이터 (2023~2024)
   실제 시험 데이터가 아니라 같은 구조(판매·제품·거래처·날짜)로 만든 연습용 데이터입니다.
   난수 시드가 고정되어 있어 누구에게나 같은 값이 나옵니다. */
(function (global) {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20261021);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

  const products = [
    ["P01", "경량 패딩", "의류", "아우터", 129000, 61000],
    ["P02", "고어텍스 자켓", "의류", "아우터", 259000, 128000],
    ["P03", "기능성 티셔츠", "의류", "상의", 39000, 15000],
    ["P04", "플리스 집업", "의류", "상의", 69000, 30000],
    ["P05", "트레킹 팬츠", "의류", "하의", 79000, 34000],
    ["P06", "레깅스", "의류", "하의", 49000, 19000],
    ["P07", "미드컷 등산화", "신발", "등산화", 189000, 92000],
    ["P08", "경량 트레킹화", "신발", "등산화", 139000, 66000],
    ["P09", "러닝화", "신발", "운동화", 119000, 52000],
    ["P10", "30L 배낭", "용품", "배낭", 99000, 41000],
    ["P11", "데이팩", "용품", "배낭", 59000, 24000],
    ["P12", "2인 텐트", "용품", "캠핑", 229000, 120000],
    ["P13", "캠핑 체어", "용품", "캠핑", 45000, 18000],
    ["P14", "등산 스틱", "용품", "액세서리", 55000, 21000],
  ].map(([c, n, cat, sub, price, cost]) => ({ 제품코드: c, 제품명: n, 분류명: cat, 제품분류명: sub, 정가: price, 원가: cost }));

  const clients = [
    ["C01", "강남점", "매장", "서울"],
    ["C02", "송파점", "매장", "서울"],
    ["C03", "분당점", "매장", "경기"],
    ["C04", "수원점", "매장", "경기"],
    ["C05", "해운대점", "매장", "부산"],
    ["C06", "자사몰", "온라인", "전국"],
    ["C07", "오픈마켓", "온라인", "전국"],
    ["C08", "홈쇼핑", "온라인", "전국"],
  ].map(([c, n, ch, r]) => ({ 거래처코드: c, 거래처명: n, 채널: ch, 지역: r }));

  // 날짜 테이블
  const dates = [];
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  for (let t = D(2023, 1, 1).getTime(); t <= D(2024, 12, 31).getTime(); t += 86400000) {
    const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, q = Math.ceil(m / 3), w = d.getUTCDay();
    dates.push({ 날짜: d, 연도: y, 분기: q + "분기", 월: m, 월이름: m + "월", 연월: y + "-" + String(m).padStart(2, "0"), 요일: DOW[w], 주말여부: (w === 0 || w === 6) ? "주말" : "평일" });
  }

  // 계절성: 아우터는 겨울, 캠핑은 봄·가을, 티셔츠는 여름에 잘 팔림
  const season = {
    아우터: [3, 2.2, 1.2, .6, .4, .3, .3, .4, .9, 1.6, 2.6, 3.2],
    상의: [.7, .8, 1, 1.2, 1.5, 1.8, 1.9, 1.7, 1.2, 1, .8, .7],
    캠핑: [.4, .5, 1.1, 1.6, 1.8, 1.2, 1, 1.1, 1.7, 1.8, .9, .4],
  };
  const sales = [];
  let no = 1;
  for (let y = 2023; y <= 2024; y++) {
    for (let m = 1; m <= 12; m++) {
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const nOrders = Math.round((y === 2023 ? 22 : 26) + rnd() * 8);
      for (let k = 0; k < nOrders; k++) {
        // 계절 가중치로 제품 선택
        const weights = products.map((p) => (season[p.제품분류명] || [])[m - 1] || 1);
        let r = rnd() * weights.reduce((a, b) => a + b, 0), pi = 0;
        while (r > weights[pi]) { r -= weights[pi]; pi++; }
        const p = products[Math.min(pi, products.length - 1)];
        const c = rnd() < .42 ? clients[5 + Math.floor(rnd() * 3)] : clients[Math.floor(rnd() * 5)];
        const day = 1 + Math.floor(rnd() * (y === 2024 && m === 12 ? 27 : lastDay));
        const od = D(y, m, day);
        const sd = new Date(od.getTime() + (1 + Math.floor(rnd() * 4)) * 86400000);
        const qty = 1 + Math.floor(rnd() * rnd() * 6);
        const disc = pick([0, 0, 0, 0, .05, .1, .1, .2]);
        const unit = p.정가;
        sales.push({
          판매번호: "S" + String(no++).padStart(4, "0"),
          주문일: od, 배송일: sd, 제품코드: p.제품코드, 거래처코드: c.거래처코드,
          수량: qty, 단가: unit, 할인율: disc, 매출금액: Math.round(qty * unit * (1 - disc)),
        });
      }
    }
  }
  sales.sort((a, b) => a.주문일 - b.주문일 || a.판매번호.localeCompare(b.판매번호));
  sales.forEach((s, i) => (s.판매번호 = "S" + String(i + 1).padStart(4, "0")));

  global.BIZVIZ_MODEL = {
    name: "산길아웃도어 판매",
    tables: [
      { name: "판매", rows: sales, columns: [
        { name: "판매번호", type: "text" }, { name: "주문일", type: "date" }, { name: "배송일", type: "date" },
        { name: "제품코드", type: "text" }, { name: "거래처코드", type: "text" }, { name: "수량", type: "int" },
        { name: "단가", type: "int" }, { name: "할인율", type: "pct" }, { name: "매출금액", type: "int" }] },
      { name: "제품", rows: products, columns: [
        { name: "제품코드", type: "text" }, { name: "제품명", type: "text" }, { name: "분류명", type: "text" },
        { name: "제품분류명", type: "text" }, { name: "정가", type: "int" }, { name: "원가", type: "int" }] },
      { name: "거래처", rows: clients, columns: [
        { name: "거래처코드", type: "text" }, { name: "거래처명", type: "text" }, { name: "채널", type: "text" }, { name: "지역", type: "text" }] },
      { name: "날짜", dateColumn: "날짜", rows: dates, columns: [
        { name: "날짜", type: "date" }, { name: "연도", type: "int" }, { name: "분기", type: "text" }, { name: "월", type: "int" },
        { name: "월이름", type: "text", sortBy: "월" }, { name: "연월", type: "text" }, { name: "요일", type: "text" }, { name: "주말여부", type: "text" }] },
    ],
    relationships: [
      { from: ["판매", "제품코드"], to: ["제품", "제품코드"], active: true },
      { from: ["판매", "거래처코드"], to: ["거래처", "거래처코드"], active: true },
      { from: ["판매", "주문일"], to: ["날짜", "날짜"], active: true },
      { from: ["판매", "배송일"], to: ["날짜", "날짜"], active: false },
    ],
    measures: [
      { name: "총수량", table: "판매", expr: "SUM(판매[수량])", format: "#,##0" },
      { name: "총매출금액", table: "판매", expr: "SUM(판매[매출금액])", format: "#,##0" },
      { name: "총원가", table: "판매", expr: "SUMX(판매, 판매[수량] * RELATED(제품[원가]))", format: "#,##0" },
      { name: "매출이익", table: "판매", expr: "[총매출금액] - [총원가]", format: "#,##0" },
      { name: "매출이익률", table: "판매", expr: "DIVIDE([매출이익], [총매출금액])", format: "0.0%" },
    ],
  };
})(typeof window !== "undefined" ? window : globalThis);
