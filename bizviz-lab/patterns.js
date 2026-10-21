/* DAX 패턴 사전 — 주제별 정리. 모든 식은 사이트의 데이터 모델에서 실제로 계산되는지 검증됨.
   mode: measure(기본) | column(table 지정) | table
   rows/cols: 랩에서 열 때 행렬 축 */
(function (global) {
  const T = "'날짜'[날짜]";
  const PATTERNS = [
    // ── 문법 기초 ──
    { id: "syn-measure", cat: "문법 기초", t: "측정값 정의의 기본 형태", c: "총매출 = SUM(판매[매출금액])", rows: "제품[분류명]",
      when: "모든 측정값의 출발점. <b>이름 = 식</b>. 열은 <code>테이블[열]</code>, 측정값은 <code>[측정값]</code>으로 씁니다.",
      pit: "테이블 이름에 공백·특수문자가 있으면 작은따옴표로 감쌉니다: <code>'판매 내역'[금액]</code>. 텍스트 값은 큰따옴표 <code>\"매장\"</code>." },
    { id: "syn-var", cat: "문법 기초", t: "VAR … RETURN", c: `증감률 =\nVAR 당월 = [총매출금액]\nVAR 전년 = CALCULATE([총매출금액], SAMEPERIODLASTYEAR(${T}))\nRETURN DIVIDE(당월 - 전년, 전년)`, rows: "날짜[월]", cols: "날짜[연도]",
      when: "같은 계산을 두 번 이상 쓰거나 식이 길어질 때. 읽기 쉽고 계산도 한 번만 합니다.",
      pit: "VAR는 <b>정의한 순간의 컨텍스트에서 한 번</b> 계산된 값입니다. 나중에 CALCULATE(변수, …)로 감싸도 다시 계산되지 않습니다." },
    { id: "syn-ops", cat: "문법 기초", t: "조건 연산자 (&&, ||, IN)", c: "서울 매장 매출 = CALCULATE([총매출금액], 거래처[채널] = \"매장\" && 거래처[지역] = \"서울\")", rows: "날짜[연도]",
      when: "그리고 <code>&&</code>, 또는 <code>||</code>, 여러 값 중 하나 <code>열 IN {\"A\", \"B\"}</code>. 텍스트 연결은 <code>&</code>.",
      pit: "CALCULATE의 조건식 하나에는 <b>한 테이블의 열만</b> 쓸 수 있습니다. 거래처 열과 제품 열을 ||로 묶으면 오류." },

    // ── 기본 집계 ──
    { id: "agg-basic", cat: "기본 집계", t: "합계·행 수·고유 개수", c: "거래처수 = DISTINCTCOUNT(판매[거래처코드])", rows: "제품[분류명]",
      when: "<code>SUM(열)</code> 합계, <code>COUNTROWS(테이블)</code> 행 수, <code>DISTINCTCOUNT(열)</code> 중복 제외 개수, <code>AVERAGE</code>, <code>MIN</code>, <code>MAX</code>.",
      pit: "총계 칸은 위 칸을 <b>더한 값이 아니라</b> 필터 없이 다시 계산한 값입니다. DISTINCTCOUNT·비율에서 차이가 납니다." },
    { id: "agg-divide", cat: "기본 집계", t: "안전한 나눗셈 DIVIDE", c: "매출이익률2 = DIVIDE([매출이익], [총매출금액])", rows: "제품[분류명]",
      when: "비율·평균 단가처럼 나누는 모든 곳. 분모가 0이거나 비면 BLANK(또는 세 번째 인수 값)를 돌려줍니다.",
      pit: "<code>/</code> 연산자는 0으로 나누면 무한대(∞)가 나옵니다. 시험에서는 DIVIDE를 쓰라고 자주 지시합니다." },
    { id: "agg-perday", cat: "기본 집계", t: "일평균 (측정값 ÷ 날짜 수)", c: "일평균 매출 = DIVIDE([총매출금액], COUNTROWS('날짜'))", rows: "날짜[연도]", cols: "날짜[분기]",
      when: "공식 모의문제의 <code>[일평균 대여건수] = [총대여건수] / COUNTROWS('DimDate')</code> 유형.",
      pit: "판매가 있었던 날만 세려면 <code>DISTINCTCOUNT(판매[주문일])</code>로 나눕니다. 무엇으로 나누라는지 지시를 정확히 읽으세요." },

    // ── 반복 함수 ──
    { id: "it-sumx", cat: "반복 함수", t: "행마다 계산 후 합계 SUMX", c: "정가매출 = SUMX(판매, 판매[수량] * 판매[단가])", rows: "거래처[채널]",
      when: "곱하기·빼기 등 <b>행 단위 계산을 먼저</b> 해야 할 때. 테이블의 각 행에서 식을 계산해 더합니다.",
      pit: "<code>SUM(판매[수량]) * SUM(판매[단가])</code>는 합계끼리의 곱이라 틀립니다." },
    { id: "it-related", cat: "반복 함수", t: "다른 테이블 값을 곱할 때 RELATED", c: "총원가2 = SUMX(판매, 판매[수량] * RELATED(제품[원가]))", rows: "제품[분류명]",
      when: "판매 행마다 제품 테이블의 원가·정가처럼 <b>1쪽 테이블 값</b>이 필요할 때.",
      pit: "RELATED는 행 컨텍스트(SUMX·FILTER·계산 열) 안에서만, 다(*)→1 방향으로만 씁니다." },
    { id: "it-per", cat: "반복 함수", t: "~당 평균 (AVERAGEX + VALUES)", c: "거래처평균매출 = AVERAGEX(VALUES(거래처[거래처명]), [총매출금액])", rows: "거래처[채널]",
      when: "거래처당·월당·제품당 평균처럼 <b>그룹별 값의 평균</b>. 같은 모양으로 MAXX(최대 월매출), MINX도 씁니다.",
      pit: "<code>AVERAGE(판매[매출금액])</code>는 '주문 1건당' 평균이라 다릅니다." },
    { id: "it-maxmonth", cat: "반복 함수", t: "최대 월매출", c: "최대월매출 = MAXX(VALUES('날짜'[연월]), [총매출금액])", rows: "날짜[연도]",
      when: "기간 중 가장 매출이 큰 달·날의 값.", pit: "VALUES('날짜'[월])을 쓰면 여러 해의 같은 월이 합쳐집니다. 연월처럼 유일한 열을 쓰세요." },

    // ── CALCULATE 필터 ──
    { id: "calc-filter", cat: "CALCULATE 필터", t: "조건부 합계 (FILTER)", c: "매출_매장 = CALCULATE([총매출금액], FILTER('거래처', [채널] = \"매장\"))", rows: "날짜[연도]",
      when: "공식 모의문제 형태 그대로. <code>CALCULATE([총매출금액], 거래처[채널] = \"매장\")</code>도 같은 결과입니다.",
      pit: "텍스트는 큰따옴표, 숫자는 따옴표 없이. <code>판매[수량] >= \"3\"</code>은 오류." },
    { id: "calc-and", cat: "CALCULATE 필터", t: "여러 조건 (AND)", c: "매장의류수량 = CALCULATE([총수량], 거래처[채널] = \"매장\", 제품[분류명] = \"의류\")", rows: "날짜[연도]",
      when: "필터 인수를 쉼표로 여러 개 주면 모두 만족(AND)하는 행만 남습니다.", pit: "다른 테이블 열끼리 '또는'이 필요하면 FILTER(판매, RELATED(…) = … || RELATED(…) = …)." },
    { id: "calc-in", cat: "CALCULATE 필터", t: "여러 값 중 하나 (IN)", c: "의류신발매출 = CALCULATE([총매출금액], 제품[분류명] IN {\"의류\", \"신발\"})", rows: "거래처[지역]",
      when: "같은 열에서 값 여러 개를 허용할 때.", pit: "<code>제품[분류명] = \"의류\" || 제품[분류명] = \"신발\"</code>과 같은 뜻입니다." },
    { id: "calc-keep", cat: "CALCULATE 필터", t: "덮어쓰기 vs KEEPFILTERS", c: "의류매출K = CALCULATE([총매출금액], KEEPFILTERS(제품[분류명] = \"의류\"))", rows: "제품[분류명]",
      when: "행렬의 기존 필터와 <b>교집합</b>을 원할 때. KEEPFILTERS 없이 쓰면 같은 열의 필터를 덮어써서 모든 행에 의류 매출이 나옵니다.",
      pit: "랩에서 KEEPFILTERS를 지우고 실행해 차이를 직접 보세요." },
    { id: "calc-measure", cat: "CALCULATE 필터", t: "측정값으로 거르기", c: "우수제품수 = COUNTROWS(FILTER(VALUES(제품[제품명]), [총매출금액] >= 10000000))", rows: "제품[분류명]",
      when: "'매출 1천만 이상인 제품 수'처럼 조건에 <b>측정값</b>이 들어갈 때는 FILTER(VALUES(…), [측정값] 조건).",
      pit: "<code>CALCULATE(…, [총매출금액] > 100)</code>처럼 조건식 필터에 측정값을 직접 넣으면 오류." },
    { id: "calc-userel", cat: "CALCULATE 필터", t: "비활성 관계 사용", c: "배송기준 매출 = CALCULATE([총매출금액], USERELATIONSHIP(판매[배송일], '날짜'[날짜]))", rows: "날짜[연월]",
      when: "날짜가 두 개(주문일·배송일)인 사실 테이블에서 두 번째 날짜 기준으로 집계할 때.",
      pit: "모델에 관계가 (점선으로) 미리 있어야 합니다. CALCULATE 안에서만 쓸 수 있습니다." },

    // ── ALL·비중 ──
    { id: "all-share", cat: "ALL·비중", t: "전체 대비 비중", c: "매출 비중 = DIVIDE([총매출금액], CALCULATE([총매출금액], ALL(제품)))", rows: "제품[분류명]",
      when: "구성비. 분모에서 행렬의 제품 필터를 지웁니다. 총계 행이 100%가 되는지로 검산하세요.",
      pit: "행이 제품명인데 <code>ALL(제품[분류명])</code>을 쓰면 제품명 필터가 남아 모두 100%가 됩니다. 테이블 전체 ALL(제품)이 안전합니다." },
    { id: "all-selected", cat: "ALL·비중", t: "선택 범위 대비 비중", c: "선택 비중 = DIVIDE([총매출금액], CALCULATE([총매출금액], ALLSELECTED(제품[분류명])))", rows: "제품[분류명]",
      when: "슬라이서로 고른 범위 안에서의 구성비. ALL은 슬라이서 선택까지 지워 버립니다.", pit: "랩에서 분류명 슬라이서를 두 개만 골라 ALL과 비교해 보세요." },
    { id: "all-parent", cat: "ALL·비중", t: "상위 그룹(분류) 안 비중", c: "분류내비중 = DIVIDE([총매출금액], CALCULATE([총매출금액], ALL(제품), VALUES(제품[분류명])))", rows: "제품[제품명]",
      when: "'자기 분류 안에서 각 제품의 비중'. ALL(제품)로 다 지운 뒤 VALUES(제품[분류명])로 현재 제품의 분류만 다시 넣습니다.",
      pit: "행렬에 분류명이 행으로 함께 있으면 <code>ALLEXCEPT(제품, 제품[분류명])</code>으로도 됩니다. ALLEXCEPT는 <b>직접 걸린</b> 분류명 필터만 남기기 때문입니다." },
    { id: "all-total", cat: "ALL·비중", t: "항상 전체 값", c: "전체매출 = CALCULATE([총매출금액], REMOVEFILTERS())", rows: "제품[분류명]", cols: "날짜[연도]",
      when: "기준선·전체 평균처럼 필터와 상관없이 고정된 값. ALL(판매)도 같은 효과(연결된 1쪽 필터까지 제거).", pit: "REMOVEFILTERS·ALL은 CALCULATE 안에서 '필터 제거'로 동작합니다." },
    { id: "all-one", cat: "ALL·비중", t: "하나만 선택됐을 때만 표시", c: "분류매출 = IF(HASONEVALUE(제품[분류명]), [총매출금액])", rows: "제품[분류명]",
      when: "총계 행을 비우거나, 하나를 골랐을 때만 값을 보일 때. ISFILTERED·ISINSCOPE도 비슷한 용도.", pit: "IF의 세 번째 인수를 생략하면 BLANK가 됩니다." },

    // ── 컨텍스트 전환 ──
    { id: "ctx-col", cat: "컨텍스트 전환", t: "계산 열에서 집계 (CALCULATE)", c: "판매수량 = CALCULATE(SUM(판매[수량]))", mode: "column", table: "제품",
      when: "제품 테이블 계산 열에 '그 제품의 판매수량'. CALCULATE가 현재 행을 필터로 바꿉니다(컨텍스트 전환).",
      pit: "<code>SUM(판매[수량])</code>만 쓰면 모든 행에 전체 합계가 나옵니다. 측정값 참조 <code>[총수량]</code>은 자동으로 CALCULATE가 붙어 제품별 값이 됩니다." },
    { id: "ctx-iter", cat: "컨텍스트 전환", t: "반복 함수 안의 측정값", c: "월평균매출 = AVERAGEX(VALUES('날짜'[연월]), [총매출금액])", rows: "날짜[연도]",
      when: "SUMX·AVERAGEX·FILTER 안에서 측정값을 부르면 각 행(연월)이 필터가 되어 계산됩니다.", pit: "측정값 대신 SUM(판매[매출금액])을 쓰면 전환이 일어나지 않아 모든 행이 같은 값이 됩니다." },

    // ── 시간 인텔리전스 ──
    { id: "ti-pm", cat: "시간 인텔리전스", t: "전월 매출", c: `전월_매출 = CALCULATE([총매출금액], DATEADD(${T}, -1, MONTH))`, rows: "날짜[연월]",
      when: "공식 모의문제 유형. DATEADD(날짜열, 개수, DAY|MONTH|QUARTER|YEAR).", pit: "날짜 테이블의 날짜 열을 써야 합니다. 첫 달은 빈 값." },
    { id: "ti-ytd", cat: "시간 인텔리전스", t: "연간 누계", c: `연간_누계 = TOTALYTD([총매출금액], ${T})`, rows: "날짜[월]", cols: "날짜[연도]",
      when: "연초부터 현재까지. <code>CALCULATE([총매출금액], DATESYTD(날짜열))</code>과 같습니다. 분기·월은 TOTALQTD, TOTALMTD.",
      pit: "회계연도가 6월 말에 끝나면 <code>TOTALYTD(식, 날짜열, \"6-30\")</code>." },
    { id: "ti-py", cat: "시간 인텔리전스", t: "전년 동기", c: `전년동월 = CALCULATE([총매출금액], SAMEPERIODLASTYEAR(${T}))`, rows: "날짜[월]", cols: "날짜[연도]",
      when: "작년 같은 기간. <code>DATEADD(날짜열, -1, YEAR)</code>와 같습니다.", pit: "PARALLELPERIOD(…, -1, YEAR)는 작년 <b>1년 전체</b>를 돌려주므로 월별 비교에 쓰면 다릅니다." },
    { id: "ti-yoy", cat: "시간 인텔리전스", t: "전년 대비 증감률", c: `전년대비 증감률 =\nVAR 당월 = [총매출금액]\nVAR 전년 = CALCULATE([총매출금액], SAMEPERIODLASTYEAR(${T}))\nRETURN DIVIDE(당월 - 전년, 전년)`, rows: "날짜[월]", cols: "날짜[연도]",
      when: "행렬 '전년비' 열과 조건부 서식 아이콘(▲▼)의 단골 측정값.", pit: "(당월 − 전년) ÷ <b>전년</b>. 분모를 당월로 쓰는 실수가 흔합니다." },
    { id: "ti-mom", cat: "시간 인텔리전스", t: "전월 대비 증감률", c: `전월대비증감률 =\nVAR 전월 = CALCULATE([총매출금액], DATEADD(${T}, -1, MONTH))\nRETURN DIVIDE([총매출금액] - 전월, 전월)`, rows: "날짜[연월]",
      when: "월별 성장률.", pit: "PREVIOUSMONTH도 월별 값은 같지만 총계 행에서 결과가 달라집니다." },
    { id: "ti-rolling", cat: "시간 인텔리전스", t: "최근 N개월 (이동 합계·평균)", c: `최근3개월 = CALCULATE([총매출금액], DATESINPERIOD(${T}, MAX(${T}), -3, MONTH))`, rows: "날짜[연월]",
      when: "현재 달 포함 최근 3개월. 3으로 나누면 이동 평균.", pit: "기준일은 <code>MAX(날짜열)</code>(보이는 기간의 마지막 날)." },
    { id: "ti-cumul", cat: "시간 인텔리전스", t: "전체 기간 누적", c: `누적매출 = CALCULATE([총매출금액], FILTER(ALL(${T}), ${T} <= MAX(${T})))`, rows: "날짜[연월]",
      when: "연도와 상관없이 처음부터 지금까지 쌓이는 누계.", pit: "FILTER 안의 MAX는 바깥(셀) 컨텍스트에서 계산되어 '그 달의 마지막 날'이 됩니다." },
    { id: "ti-pytd", cat: "시간 인텔리전스", t: "전년 누계", c: `전년누계 = CALCULATE(TOTALYTD([총매출금액], ${T}), SAMEPERIODLASTYEAR(${T}))`, rows: "날짜[월]", cols: "날짜[연도]",
      when: "작년 같은 시점까지의 누계. 누계 성장률의 분모.", pit: "바깥 CALCULATE가 기간을 1년 전으로 옮기고, 안쪽에서 누계를 냅니다." },

    // ── 순위·TOP N ──
    { id: "rk-rankx", cat: "순위·TOP N", t: "순위 RANKX", c: "순위 = RANKX(ALL('제품'[제품명]), [총수량], , DESC, Dense)", rows: "제품[제품명]",
      when: "공식 모의문제 유형. RANKX(비교 대상 전체, 식, [값], [ASC|DESC], [Skip|Dense]).",
      pit: "ALL이 없으면 모두 1위. Dense는 1,2,2,3 / 기본 Skip은 1,2,2,4. 세 번째 인수는 보통 비워 둡니다." },
    { id: "rk-hide", cat: "순위·TOP N", t: "총계 행 순위 숨기기", c: "순위2 = IF(HASONEVALUE(제품[제품명]), RANKX(ALL(제품[제품명]), [총매출금액]))", rows: "제품[제품명]",
      when: "총계 행에 의미 없는 '1'이 나오는 것을 막을 때.", pit: "ISINSCOPE(제품[제품명])도 같은 용도로 씁니다." },
    { id: "rk-topn", cat: "순위·TOP N", t: "상위 N개 합계", c: "Top3매출 = CALCULATE([총매출금액], TOPN(3, ALL(제품[제품명]), [총매출금액]))", rows: "제품[분류명]",
      when: "상위 3개 제품의 매출 합. TOPN(개수, 테이블, 정렬식)은 테이블을 돌려주므로 필터나 SUMX에 넣습니다.", pit: "동점이 있으면 N개보다 많은 행이 나올 수 있습니다." },
    { id: "rk-top1", cat: "순위·TOP N", t: "1위 항목 이름", c: "1위제품 = MAXX(TOPN(1, VALUES(제품[제품명]), [총매출금액]), 제품[제품명])", rows: "제품[분류명]",
      when: "카드에 '가장 많이 팔린 제품명' 표시.", pit: "결과가 텍스트이므로 서식은 일반." },

    // ── 논리·텍스트 ──
    { id: "lg-switch", cat: "논리·텍스트", t: "여러 구간 분류 SWITCH(TRUE())", c: "매출 등급 = SWITCH(TRUE(), [총매출금액] >= 30000000, \"A\", [총매출금액] >= 10000000, \"B\", \"C\")", rows: "거래처[거래처명]",
      when: "중첩 IF 대신. 위에서부터 처음 참인 조건의 결과.", pit: "조건 순서가 중요합니다. 큰 기준부터 쓰세요." },
    { id: "lg-selected", cat: "논리·텍스트", t: "동적 제목 SELECTEDVALUE", c: "제목 = \"선택 연도: \" & SELECTEDVALUE('날짜'[연도], \"전체\")", rows: "날짜[연도]",
      when: "카드·차트 제목의 fx(조건부 서식)에 연결하는 텍스트 측정값.", pit: "여러 개가 선택되면 대체값(두 번째 인수)이 나옵니다." },
    { id: "lg-arrow", cat: "논리·텍스트", t: "증감 기호 ▲▼", c: `증감표시 =\nVAR 차이 = [총매출금액] - CALCULATE([총매출금액], DATEADD(${T}, -1, MONTH))\nRETURN IF(차이 > 0, "▲", IF(차이 < 0, "▼", "-"))`, rows: "날짜[연월]",
      when: "텍스트로 증감 방향을 보일 때. (행렬 아이콘은 조건부 서식으로도 가능)", pit: "기호를 직접 칠 수 없으면 UNICHAR(9650)=▲, UNICHAR(9660)=▼." },
    { id: "lg-format", cat: "논리·텍스트", t: "FORMAT으로 텍스트 만들기", c: "매출표시 = FORMAT([총매출금액], \"#,##0\") & \"원\"", rows: "제품[분류명]",
      when: "카드 문구, 레이블. 서식 코드: \"#,##0\", \"0.0%\", \"yyyy-mm\".", pit: "결과는 <b>텍스트</b>라서 합계·정렬·차트 값으로 쓰면 안 됩니다. 숫자 서식은 측정값 서식 설정으로." },
    { id: "lg-coalesce", cat: "논리·텍스트", t: "빈 값을 0으로", c: "매출0 = COALESCE([총매출금액], 0)", rows: "거래처[거래처명]", cols: "날짜[분기]",
      when: "BLANK 대신 0을 보이고 싶을 때. <code>IF(ISBLANK(x), 0, x)</code>와 같습니다.", pit: "0을 넣으면 행렬에서 빈 행이 숨겨지지 않고 모두 표시됩니다." },

    // ── 관계·계산 열 ──
    { id: "col-related", cat: "관계·계산 열", t: "계산 열에서 다른 테이블 값", c: "분류명 = RELATED(제품[분류명])", mode: "column", table: "판매",
      when: "판매 테이블에 제품 분류명을 붙일 때. 다(*)쪽 → 1쪽.", pit: "1쪽 → 다쪽은 RELATEDTABLE(테이블)이고, 결과가 여러 행이라 COUNTROWS·SUMX로 감쌉니다." },
    { id: "col-if", cat: "관계·계산 열", t: "구분 열 만들기", c: "가격대 = IF(제품[정가] >= 100000, \"고가\", \"일반\")", mode: "column", table: "제품",
      when: "슬라이서·축·범례에 쓸 그룹. 측정값은 축에 못 쓰므로 계산 열로 만듭니다.", pit: "계산 열은 새로 고침 때 한 번 계산되어 저장됩니다. 슬라이서에 따라 바뀌지 않습니다." },
    { id: "col-datediff", cat: "관계·계산 열", t: "날짜 차이", c: "배송일수 = DATEDIFF(판매[주문일], 판매[배송일], DAY)", mode: "column", table: "판매",
      when: "소요일·근속 기간. 단위 DAY, MONTH, YEAR 등.", pit: "인수 순서는 (시작, 끝, 단위). 날짜끼리 빼도 일수가 나옵니다." },
    { id: "col-relatedtable", cat: "관계·계산 열", t: "1쪽에서 다쪽 행 세기", c: "판매건수 = COUNTROWS(RELATEDTABLE(판매))", mode: "column", table: "제품",
      when: "제품마다 주문 건수 같은 값을 계산 열로.", pit: "CALCULATE(COUNTROWS(판매))와 같은 결과입니다." },

    // ── 계산 테이블 ──
    { id: "tb-dimdate", cat: "계산 테이블", t: "날짜 테이블 만들기", c: "DimDate = ADDCOLUMNS(CALENDAR(DATE(2024,1,1), DATE(2024,3,31)), \"연도\", YEAR([Date]), \"월\", MONTH([Date]))", mode: "table",
      when: "공식 모의문제 유형. 모델링 > 새 테이블. CALENDAR가 만드는 열 이름은 [Date].", pit: "만든 뒤 [Date] 서식 지정, 관계(사실 테이블 날짜 → [Date], *:1, 단일) 설정까지 해야 점수." },
    { id: "tb-summarize", cat: "계산 테이블", t: "그룹별 요약표", c: "분류요약 = SUMMARIZE(판매, 제품[분류명], \"수량\", [총수량], \"매출\", [총매출금액])", mode: "table",
      when: "분류·연도별 집계 테이블. SUMMARIZECOLUMNS도 같은 모양.", pit: "추가 열 이름은 큰따옴표 텍스트." },
    { id: "tb-topn", cat: "계산 테이블", t: "상위 N 테이블", c: "Top5 = TOPN(5, ADDCOLUMNS(VALUES(제품[제품명]), \"매출\", [총매출금액]), [매출], DESC)", mode: "table",
      when: "상위 항목 목록.", pit: "ADDCOLUMNS 안의 측정값은 각 행으로 컨텍스트 전환되어 계산됩니다." },
    { id: "tb-series", cat: "계산 테이블", t: "숫자 범위 매개변수", c: "할인율 매개변수 = GENERATESERIES(0, 0.3, 0.05)", mode: "table",
      when: "모델링 > 새 매개변수 > 숫자 범위가 내부적으로 만드는 테이블. 선택 값은 SELECTEDVALUE로 읽습니다.", pit: "열 이름은 [Value]." },
  ];
  global.BIZVIZ_PATTERNS = PATTERNS;
})(typeof window !== "undefined" ? window : globalThis);
