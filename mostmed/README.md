# MostMed (데모)

러시아 환자 ↔ 한국 병원 연결 에이전시 홈페이지. 기획은 [PLAN.md](PLAN.md).

## 구조
```
index.html          화면 껍데기
assets/app.js       렌더링·라우팅(#/, #/c/<분야>, #/admin)·플랜·문의
assets/style.css
data/*.json         분야·시술·병원 (Supabase 테이블과 같은 구조)
supabase/schema.sql v1 이관용 테이블 + RLS
```

## 바로 바꿀 것
`assets/app.js` 맨 위 `CONFIG` — 이름, 텔레그램 아이디, 왓츠앱 번호, 전화, 응대 시간.
시술·가격은 `data/procedures.json`, 병원은 `data/clinics.json`.

## Vercel + Supabase로 옮길 때
1. Supabase에 `supabase/schema.sql` 실행, JSON을 테이블로 import
2. `app.js`의 `fetch('data/...')` → `supabase.from('procedures').select()`
3. `submitLead`의 localStorage 저장 → `supabase.from('leads').insert()` + Edge Function으로 텔레그램 봇 알림
4. 같은 Supabase를 Flutter 앱에서 재사용
