-- Folio — Supabase(Postgres) 스키마
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 이 파일 내용을 그대로 붙여넣고 실행한다.
-- 서버 코드는 런타임에 테이블을 만들지 않으므로, 이 파일을 먼저 실행해야 서버가 뜬다.
--
-- 전체 순서:
--   (1) 이 파일을 Supabase SQL Editor에서 실행 (테이블 생성)
--   (2) `npm run migrate:supabase` 실행
--       (기존 로컬 SQLite 캐시를 내 계정 데이터로 이관 — 최초 1회만)
--
-- RLS는 쓰지 않는다. 브라우저는 Supabase에 직접 붙지 않고 항상 Express 서버를
-- 거치며, 서버가 service_role 키로 접속해 user_id로 직접 필터링한다.
-- (그래서 anon 키도 필요 없다.)
--
-- 여기에 캐시하는 것은 "논문 메타데이터"뿐이다. 메모 note 원문, 하이라이트,
-- 필기는 절대 저장하지 않는다 — 항상 Zotero API에서 라이브로 읽는다.
--
-- ※ 테이블 이름에 folio_ 접두사를 붙인 이유
--   이 Supabase 프로젝트의 public 스키마에는 이미 다른 앱의 users 테이블이
--   있다(google_id/email/access_token 구조). 그대로 users라는 이름을 쓰면
--   `create table if not exists`가 조용히 넘어가 버리고, 서버는 엉뚱한 테이블을
--   보며 "zotero_user_id 컬럼이 없다"고 실패한다. 남의 테이블을 덮어쓰지 않고
--   한 프로젝트를 공유하기 위해 Folio 테이블은 전부 folio_ 로 시작한다.

-- gen_random_uuid()용 (Supabase 기본 프로젝트에는 보통 이미 설치되어 있음)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- folio_users — Zotero OAuth로 로그인한 계정. 로그인 수단은 Zotero 하나뿐이라
-- zotero_user_id가 사실상의 자연키다 (unique).
--
-- zotero_api_key: OAuth 콜백에서 받은 oauth_token_secret. Zotero-API-Key
-- 헤더에 그대로 쓴다. 기존 SQLite에서는 sync_state 테이블의 key/value로
-- 들고 있었지만, 이건 동기화 상태가 아니라 계정 자격증명이므로 여기로 옮겼다.
-- ---------------------------------------------------------------------------
create table if not exists public.folio_users (
  id              uuid primary key default gen_random_uuid(),
  zotero_user_id  text not null unique,
  zotero_username text not null default '',
  zotero_api_key  text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- folio_papers — 논문 목록/제목 검색/컬렉션 필터용 메타데이터 캐시.
-- Zotero의 item_key는 라이브러리(=유저) 안에서만 유일하므로, 전역 PK가 아니라
-- (user_id, item_key) 복합 unique로 잡는다.
-- authors/collections는 JSON 배열 — Postgres에서는 jsonb로 저장해서
-- 컬렉션 필터를 LIKE가 아니라 containment(@>)로 정확히 걸 수 있게 한다.
-- ---------------------------------------------------------------------------
create table if not exists public.folio_papers (
  id              bigserial primary key,
  user_id         uuid not null references public.folio_users(id) on delete cascade,
  item_key        text not null,
  item_version    bigint not null,
  title           text,
  authors         jsonb not null default '[]'::jsonb,
  year            text,
  attachment_key  text,
  attachment_type text,          -- 'pdf' | 'html' | null
  collections     jsonb not null default '[]'::jsonb,
  synced_at       timestamptz not null default now(),
  unique (user_id, item_key)
);

-- 목록(최근 동기화순) / 제목 정렬 조회용
create index if not exists folio_papers_user_synced_at_idx on public.folio_papers (user_id, synced_at desc);
create index if not exists folio_papers_user_title_idx on public.folio_papers (user_id, title);
-- collections @> '["<컬렉션키>"]' 필터용
create index if not exists folio_papers_collections_idx on public.folio_papers using gin (collections jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- folio_sync_state — 유저별 증분 동기화 상태. 지금 쓰는 키는 'lastVersion'
-- 하나뿐이다 (마지막으로 동기화한 Zotero 라이브러리 버전). 기존 SQLite와 같은
-- key/value 구조를 유지하되 user_id로 스코프한다.
-- ---------------------------------------------------------------------------
create table if not exists public.folio_sync_state (
  user_id uuid not null references public.folio_users(id) on delete cascade,
  key     text not null,
  value   text,
  primary key (user_id, key)
);

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신 (folio_users)
-- ---------------------------------------------------------------------------
create or replace function public.folio_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists folio_users_touch_updated_at on public.folio_users;
create trigger folio_users_touch_updated_at
  before update on public.folio_users
  for each row execute function public.folio_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: 브라우저가 Supabase에 직접 붙지 않으므로 정책을 두지 않는다.
-- 대신 anon/authenticated 역할로는 아무것도 못 읽게 RLS만 켜 둔다
-- (service_role은 RLS를 우회하므로 서버 동작에는 영향이 없다).
-- ---------------------------------------------------------------------------
alter table public.folio_users      enable row level security;
alter table public.folio_papers     enable row level security;
alter table public.folio_sync_state enable row level security;
