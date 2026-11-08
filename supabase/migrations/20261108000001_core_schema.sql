-- Konveko MVP: core schema
-- Event log (movement) is the source of truth. bundle.current_* columns are a
-- projection refreshed by app.refresh_bundle() inside the same transaction.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'produksi', 'penjahit', 'finishing', 'supervisor');
create type public.holder_type as enum ('produksi', 'penjahit', 'finishing', 'gudang');
create type public.batch_status as enum ('draft', 'berjalan', 'selesai');
create type public.bundle_status as enum (
  'siap_jahit', 'proses_jahit', 'siap_finishing', 'proses_finishing', 'ready_stock', 'dipecah'
);
create type public.movement_type as enum (
  'cut', 'split', 'receive_sew', 'finish_sew', 'receive_finishing', 'finish_finishing', 'correction'
);
create type public.reason_type as enum ('selisih', 'reject');
create type public.discrepancy_status as enum ('terbuka', 'selesai');

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------
create table public.product_variant (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  product_name  text not null,
  size          text not null,
  color         text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.fabric_roll (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  material          text not null,
  color             text not null,
  length_or_weight  numeric(10,2) check (length_or_weight > 0),
  unit              text check (unit in ('m', 'kg')),
  supplier          text,
  created_at        timestamptz not null default now()
);

create table public.holder (
  id           uuid primary key default gen_random_uuid(),
  type         public.holder_type not null,
  name         text not null,
  phone        text,
  is_external  boolean not null default false,   -- fase 3: penjahit luar
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- "user" is reserved in Postgres; app_user extends auth.users.
-- Credentials (PIN / password hash) live in Supabase Auth, not here.
create table public.app_user (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  phone       text unique,
  email       text unique,
  roles       public.app_role[] not null default '{}',
  holder_id   uuid references public.holder (id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.reason (
  id         uuid primary key default gen_random_uuid(),
  type       public.reason_type not null,
  code       text not null,
  label      text not null,
  is_active  boolean not null default true,
  unique (type, code)
);

-- ---------------------------------------------------------------------------
-- Production
-- ---------------------------------------------------------------------------
create sequence public.batch_code_seq;
create sequence public.bundle_code_seq;

create table public.production_batch (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique
                  default 'BT-' || lpad(nextval('public.batch_code_seq')::text, 4, '0'),
  fabric_roll_id  uuid not null references public.fabric_roll (id),
  status          public.batch_status not null default 'draft',
  created_by      uuid not null references public.app_user (id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create table public.bundle (
  id                 uuid primary key default gen_random_uuid(),
  -- human-readable, sequential, typed by hand when a label is damaged
  code               text not null unique
                     default 'B-' || lpad(nextval('public.bundle_code_seq')::text, 5, '0'),
  -- random, unguessable, encoded in the QR (122 bits from gen_random_uuid)
  qr_token           text not null unique
                     default replace(gen_random_uuid()::text, '-', ''),
  batch_id           uuid not null references public.production_batch (id),
  variant_id         uuid not null references public.product_variant (id),
  target_qty         integer not null check (target_qty > 0),
  parent_bundle_id   uuid references public.bundle (id),
  -- projection (refreshed by app.refresh_bundle)
  current_status     public.bundle_status not null default 'siap_jahit',
  current_qty        integer not null check (current_qty >= 0),  -- qty acuan step berikutnya (BR-01)
  current_holder_id  uuid references public.holder (id),
  last_movement_at   timestamptz not null default now(),
  version            integer not null default 1,
  created_at         timestamptz not null default now()
);
create index bundle_batch_idx on public.bundle (batch_id);
create index bundle_parent_idx on public.bundle (parent_bundle_id);
create index bundle_status_idx on public.bundle (current_status);

-- Append-only event log. Rows are never updated or deleted.
-- A correction is a new row (type = 'correction') pointing at the ORIGINAL
-- movement it replaces; the latest correction wins. is_void = true removes the
-- original movement from the effective history (status goes back one step).
create table public.movement (
  id                    uuid primary key default gen_random_uuid(),
  seq                   bigint generated always as identity unique,
  bundle_id             uuid not null references public.bundle (id),
  type                  public.movement_type not null,
  from_holder_id        uuid references public.holder (id),
  to_holder_id          uuid references public.holder (id),
  qty_sent              integer check (qty_sent >= 0),
  qty_received          integer check (qty_received >= 0),
  qty_good              integer check (qty_good >= 0),
  qty_reject            integer check (qty_reject >= 0),
  reason_id             uuid references public.reason (id),
  note                  text,
  photo_path            text,
  corrects_movement_id  uuid references public.movement (id),
  is_void               boolean not null default false,
  scanned_by            uuid not null references public.app_user (id),
  scanned_at            timestamptz not null default now(),

  constraint movement_shape check (
    case
      when type in ('cut', 'split') then
        qty_sent is not null and qty_received is null and qty_good is null and qty_reject is null
      when type in ('receive_sew', 'receive_finishing') then
        qty_sent is not null and qty_received is not null and qty_received <= qty_sent
        and qty_good is null and qty_reject is null
      when type in ('finish_sew', 'finish_finishing') then
        qty_received is not null and qty_good is not null and qty_reject is not null
        and qty_good + qty_reject = qty_received
      when type = 'correction' then
        corrects_movement_id is not null and (note is not null and length(trim(note)) > 0)
      else false
    end
  ),
  constraint movement_correction_link check (
    (type = 'correction') = (corrects_movement_id is not null)
  ),
  constraint movement_void_only_correction check (not is_void or type = 'correction')
);
create index movement_bundle_idx on public.movement (bundle_id, seq);
create index movement_corrects_idx on public.movement (corrects_movement_id);

create table public.stock_ledger (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.product_variant (id),
  qty         integer not null check (qty <> 0),       -- negative only from corrections
  ref_type    text not null check (ref_type in ('movement', 'correction')),
  ref_id      uuid not null references public.movement (id),
  bundle_id   uuid not null references public.bundle (id),
  batch_id    uuid not null references public.production_batch (id),
  created_at  timestamptz not null default now()
);
create index stock_ledger_variant_idx on public.stock_ledger (variant_id);

create table public.discrepancy (
  id           uuid primary key default gen_random_uuid(),
  bundle_id    uuid not null references public.bundle (id),
  movement_id  uuid not null unique references public.movement (id),  -- one flag per receive scan
  qty          integer not null check (qty >= 0),
  from_step    text not null check (from_step in ('produksi', 'jahit')),
  to_step      text not null check (to_step in ('jahit', 'finishing')),
  status       public.discrepancy_status not null default 'terbuka',
  resolved_by  uuid references public.app_user (id),
  resolved_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  constraint discrepancy_resolved check (
    (status = 'terbuka') = (resolved_at is null)
  )
);
create index discrepancy_open_idx on public.discrepancy (status) where status = 'terbuka';

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,
  entity_id   uuid not null,
  field       text not null,
  old_value   text,
  new_value   text,
  reason      text not null,
  changed_by  uuid not null references public.app_user (id),
  changed_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
