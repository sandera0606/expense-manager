-- =============================================================================
-- AI-native bookkeeping platform — canonical schema
-- =============================================================================
-- Run this in Supabase SQL editor (Project → SQL → New query).
-- Idempotent: safe to re-run during development.
-- Hard rule: every user-data table is RLS-gated by `user_id = auth.uid()`.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists categories_user_idx on categories(user_id);

-- -----------------------------------------------------------------------------
-- tags
-- -----------------------------------------------------------------------------
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists tags_user_idx on tags(user_id);

-- -----------------------------------------------------------------------------
-- receipts — raw uploaded artifacts (source-agnostic)
-- -----------------------------------------------------------------------------
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  source_kind text not null check (source_kind in ('upload','email','gmail','outlook','drive','dropbox')),
  source_ref jsonb,
  status text not null default 'pending'
    check (status in ('pending','extracting','extracted','failed','needs_review')),
  created_at timestamptz not null default now()
);

-- SHA-256 of the original uploaded bytes. Lets us detect exact duplicates
-- (same photo uploaded twice, same email forwarded twice) and short-circuit
-- before re-extracting.
alter table receipts
  add column if not exists file_hash text;

create index if not exists receipts_user_idx on receipts(user_id, created_at desc);
create index if not exists receipts_status_idx on receipts(user_id, status);
create unique index if not exists receipts_user_hash_idx
  on receipts(user_id, file_hash) where file_hash is not null;

-- -----------------------------------------------------------------------------
-- transactions — canonical normalized financial records
-- -----------------------------------------------------------------------------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete set null,
  occurred_at timestamptz not null,
  merchant text,
  merchant_normalized text,
  total_amount numeric(14,4) not null,
  currency char(3) not null default 'USD',
  payment_method text,
  category_id uuid references categories(id) on delete set null,
  notes text,
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_idx on transactions(user_id, occurred_at desc);
create index if not exists transactions_category_idx on transactions(user_id, category_id);
create index if not exists transactions_merchant_idx on transactions(user_id, merchant_normalized);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- transaction_line_items — optional line-level detail
-- -----------------------------------------------------------------------------
create table if not exists transaction_line_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  description text not null,
  quantity numeric(10,3),
  unit_price numeric(14,4),
  total numeric(14,4) not null,
  position int not null,
  unique (transaction_id, position)
);

-- Per-line category. Nullable: lines fall back to transactions.category_id
-- when null. Added after the base table so re-running this schema on an
-- existing database is safe.
alter table transaction_line_items
  add column if not exists category_id uuid references categories(id) on delete set null;

create index if not exists line_items_txn_idx on transaction_line_items(transaction_id);
create index if not exists line_items_category_idx on transaction_line_items(category_id);

-- -----------------------------------------------------------------------------
-- transaction_tags — many-to-many
-- -----------------------------------------------------------------------------
create table if not exists transaction_tags (
  transaction_id uuid not null references transactions(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- -----------------------------------------------------------------------------
-- extraction_runs — AI audit trail (every call recorded, success or failure)
-- -----------------------------------------------------------------------------
create table if not exists extraction_runs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  provider text not null,
  model text not null,
  prompt_version text not null,
  raw_response jsonb not null,
  parsed_output jsonb,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  cost_usd numeric(10,6),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists extraction_runs_receipt_idx on extraction_runs(receipt_id, created_at desc);

-- -----------------------------------------------------------------------------
-- views — saved ViewQuery filters
-- -----------------------------------------------------------------------------
create table if not exists views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists views_user_idx on views(user_id);

-- -----------------------------------------------------------------------------
-- layouts — adaptive presentation specs (Layout JSON)
-- -----------------------------------------------------------------------------
create table if not exists layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  spec jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists layouts_user_idx on layouts(user_id);
create unique index if not exists layouts_user_default_idx
  on layouts(user_id) where is_default;

-- -----------------------------------------------------------------------------
-- pairing_codes — short-lived single-use codes that let a phone sign in
-- without typing email/password. Desktop (already authed) generates a code
-- and displays it as a QR; phone hits /pair/<code>, server validates,
-- trades for a Supabase magic-link token, and signs the phone in.
-- Service-role only: no RLS policies. Generation and consume both run with
-- the admin client.
-- -----------------------------------------------------------------------------
create table if not exists pairing_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumer_ip inet,
  consumer_ua text
);

create index if not exists pairing_codes_expires_idx
  on pairing_codes(expires_at) where consumed_at is null;

alter table pairing_codes enable row level security;
-- (intentionally no policies — consume must run unauthenticated under the
-- service role; that's the whole point of the pairing handshake)

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table categories             enable row level security;
alter table tags                   enable row level security;
alter table receipts               enable row level security;
alter table transactions           enable row level security;
alter table transaction_line_items enable row level security;
alter table transaction_tags       enable row level security;
alter table extraction_runs        enable row level security;
alter table views                  enable row level security;
alter table layouts                enable row level security;

-- Drop existing policies so this script is idempotent
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in (
               'categories','tags','receipts','transactions',
               'transaction_line_items','transaction_tags','extraction_runs',
               'views','layouts'
             )
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Standard policies: user owns their rows
create policy categories_owner on categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy tags_owner on tags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy receipts_owner on receipts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy transactions_owner on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Join tables: scope through the parent's user_id
create policy line_items_owner on transaction_line_items
  for all using (exists (
    select 1 from transactions t
    where t.id = transaction_line_items.transaction_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from transactions t
    where t.id = transaction_line_items.transaction_id and t.user_id = auth.uid()
  ));

create policy transaction_tags_owner on transaction_tags
  for all using (exists (
    select 1 from transactions t
    where t.id = transaction_tags.transaction_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from transactions t
    where t.id = transaction_tags.transaction_id and t.user_id = auth.uid()
  ));

create policy extraction_runs_owner on extraction_runs
  for all using (exists (
    select 1 from receipts r
    where r.id = extraction_runs.receipt_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from receipts r
    where r.id = extraction_runs.receipt_id and r.user_id = auth.uid()
  ));

create policy views_owner on views
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy layouts_owner on layouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- Storage — `receipts` bucket + RLS
-- Files are stored under `<user_id>/<receipt_id>.<ext>`. Owner-only access.
-- =============================================================================

-- Create the bucket (idempotent). 20 MB file size limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 20971520)
on conflict (id) do update set public = excluded.public,
                               file_size_limit = excluded.file_size_limit;

-- Drop any prior receipts_* policies on storage.objects
do $$ declare r record; begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'receipts_%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy receipts_owner_select on storage.objects
  for select to authenticated using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy receipts_owner_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy receipts_owner_update on storage.objects
  for update to authenticated using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy receipts_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================================================
-- Onboard new users: seed default categories + a default Layout
-- =============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Starter categories (single-tier; user can reorganize later)
  insert into categories (user_id, name) values
    (new.id, 'Food & Drink'),
    (new.id, 'Groceries'),
    (new.id, 'Transport'),
    (new.id, 'Housing'),
    (new.id, 'Utilities'),
    (new.id, 'Health'),
    (new.id, 'Entertainment'),
    (new.id, 'Shopping'),
    (new.id, 'Travel'),
    (new.id, 'Subscriptions'),
    (new.id, 'Income'),
    (new.id, 'Other')
  on conflict do nothing;

  -- Default Layout JSON: a single descending list of transaction cards.
  -- Shape must match types/layout.ts → Layout.
  insert into layouts (user_id, name, spec, is_default) values (
    new.id,
    'Feed',
    jsonb_build_object(
      'id', 'default-feed',
      'name', 'Feed',
      'root', jsonb_build_object(
        'kind', 'list',
        'source', jsonb_build_object(
          'sort', jsonb_build_array(jsonb_build_object('field','occurred_at','dir','desc')),
          'limit', 100
        ),
        'row', jsonb_build_object(
          'kind', 'card',
          'fields', jsonb_build_array(
            jsonb_build_object('field','occurred_at','format','date'),
            jsonb_build_object('field','merchant_normalized','label','Merchant'),
            jsonb_build_object('field','total_amount','format','currency'),
            jsonb_build_object('field','currency')
          )
        ),
        'empty', 'No transactions yet. Upload a receipt to get started.'
      )
    ),
    true
  );

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- Verification — these SELECTs return rows so the SQL editor's result panel
-- shows you what was actually installed. Should report:
--   tables                = 10
--   policies_public       = 9
--   policies_storage      = 4
--   bucket_receipts       = 1
--   trigger_on_new_user   = 1
--   line_item_category    = 1   (per-line categories)
--   receipt_file_hash     = 1   (duplicate detection)
-- If any number is lower, scroll up in the editor output for the SQL error.
-- =============================================================================
select
  (select count(*) from pg_tables where schemaname='public'
     and tablename in ('categories','tags','receipts','transactions',
                       'transaction_line_items','transaction_tags','extraction_runs',
                       'views','layouts','pairing_codes')) as tables,
  (select count(*) from pg_policies where schemaname='public') as policies_public,
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
     and policyname like 'receipts_%') as policies_storage,
  (select count(*) from storage.buckets where id='receipts') as bucket_receipts,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='transaction_line_items'
       and column_name='category_id') as line_item_category,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='receipts'
       and column_name='file_hash') as receipt_file_hash,
  (select count(*) from pg_trigger where tgname='on_auth_user_created') as trigger_on_new_user;
