-- MostMed — Supabase schema (v1 이관용). data/*.json 과 같은 필드 구조.

create table categories (
  id text primary key,                -- 'plastic', 'derma', ...
  sort int not null default 0,
  name_ru text not null,
  name_ko text not null,
  name_en text,
  short_ru text,
  short_ko text,
  short_en text
);

create table procedures (
  id text primary key,
  category_id text not null references categories(id),
  name_ru text not null,
  name_ko text not null,
  name_en text,
  desc_ru text,
  desc_ko text,
  desc_en text,
  recovery_ru text,
  recovery_ko text,
  recovery_en text,
  price_from_usd int,
  price_to_usd int,
  stay_days int,
  popular boolean default false,
  keywords text[] default '{}',
  is_published boolean default true
);

create table clinics (
  id text primary key,
  name text not null,
  city_ru text, city_ko text, city_en text,
  type_ru text, type_ko text, type_en text,
  categories text[] default '{}',
  tags text[] default '{}',           -- ru | transfer | online | intl
  is_foreign_patient_registered boolean default false,
  is_published boolean default false   -- 협약 체결 후에만 공개
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  city text,
  channel text check (channel in ('telegram','whatsapp','phone','email')),
  contact text not null,
  message text,
  procedure_ids text[] default '{}',
  lang text default 'ru',
  status text default 'new' check (status in ('new','in_progress','offer_sent','booked','closed')),
  consent_at timestamptz not null      -- 개인정보·의료정보 수집 동의 시각
);

-- RLS: 공개 테이블은 읽기만, leads 는 익명 insert 만 허용 / 조회는 관리자만
alter table categories enable row level security;
alter table procedures enable row level security;
alter table clinics    enable row level security;
alter table leads      enable row level security;

create policy "public read categories" on categories for select using (true);
create policy "public read procedures" on procedures for select using (is_published);
create policy "public read clinics"    on clinics    for select using (is_published);
create policy "anon insert leads"      on leads      for insert with check (true);
create policy "admin read leads"       on leads      for select using (auth.role() = 'authenticated');
create policy "admin update leads"     on leads      for update using (auth.role() = 'authenticated');
