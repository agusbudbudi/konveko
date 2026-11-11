-- Notification engine (doc/PRD Notifikasi.md)
--
--   event (trigger) ─► app.notify(type, entity, data)
--                        ├─ notification           in-app inbox, one row per recipient
--                        └─ notification_delivery  outbox for external channels (email, ...),
--                                                  only for type × channel switched on in
--                                                  notification_channel_setting
--
-- The database stores raw data only. Titles, bodies and email templates are
-- rendered in TypeScript (lib/notifications/registry.ts) from type + data.
-- External channels are sent by the app (lib/notifications/dispatch.ts) with
-- the service role, so a failing email never rolls back a scan.

create type public.notification_delivery_status as enum ('antre', 'terkirim', 'gagal', 'dilewati');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.notification (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.app_user (id) on delete cascade,
  type         text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type  text not null,
  entity_id    uuid not null,
  data         jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  -- one notification per recipient per event: app.notify is idempotent
  constraint notification_once unique (type, entity_id, user_id)
);
create index notification_user_idx on public.notification (user_id, created_at desc);
create index notification_unread_idx on public.notification (user_id) where read_at is null;
create index notification_entity_idx on public.notification (entity_type, entity_id);

create table public.notification_channel_setting (
  type        text not null,
  channel     text not null check (channel in ('email')),
  is_enabled  boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (type, channel)
);

create table public.notification_delivery (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid not null references public.notification (id) on delete cascade,
  channel          text not null check (channel in ('email')),
  status           public.notification_delivery_status not null default 'antre',
  attempts         integer not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (notification_id, channel),
  constraint notification_delivery_sent check ((status = 'terkirim') = (sent_at is not null))
);
create index notification_delivery_queue_idx on public.notification_delivery (next_attempt_at)
  where status = 'antre';

insert into public.notification_channel_setting (type, channel, is_enabled)
values ('selisih.baru', 'email', false);

-- ---------------------------------------------------------------------------
-- Engine
-- ---------------------------------------------------------------------------

-- Who receives a notification type. One place to change the routing rules.
create function app.notification_recipients(p_type text)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select u.id
  from public.app_user u
  where u.is_active
    and case p_type
          when 'selisih.baru' then u.roles && array['supervisor', 'admin']::public.app_role[]
          else false
        end
$$;

-- The only way to create notifications. Returns how many recipients got one.
create function app.notify(
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_data jsonb default '{}'::jsonb,
  p_exclude_user uuid default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  with created as (
    insert into public.notification (user_id, type, entity_type, entity_id, data)
    select r.id, p_type, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb)
    from app.notification_recipients(p_type) as r(id)
    where r.id is distinct from p_exclude_user
    on conflict on constraint notification_once do nothing
    returning id
  ),
  queued as (
    insert into public.notification_delivery (notification_id, channel)
    select c.id, s.channel
    from created c
    cross join public.notification_channel_setting s
    where s.type = p_type and s.is_enabled
    returning 1
  )
  select count(*) into v_count from created;
  return v_count;
end $$;

-- Mark the caller's notifications read. p_ids null = all of them.
create function app.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not app.is_active_user() then
    raise exception 'Sesi tidak valid. Silakan masuk lagi.' using detail = 'forbidden_role';
  end if;
  update public.notification
  set read_at = now()
  where user_id = (select auth.uid())
    and read_at is null
    and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Close notifications about an entity that needs no more attention: read for
-- everyone, and queued external deliveries are dropped.
create function app.settle_notifications(p_entity_type text, p_entity_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.notification
  set read_at = now()
  where entity_type = p_entity_type and entity_id = p_entity_id and read_at is null;

  update public.notification_delivery d
  set status = 'dilewati', last_error = p_reason
  from public.notification n
  where n.id = d.notification_id
    and n.entity_type = p_entity_type and n.entity_id = p_entity_id
    and d.status = 'antre';
end $$;

-- ---------------------------------------------------------------------------
-- Dispatcher API (service role only)
-- ---------------------------------------------------------------------------

-- Lease up to p_limit due deliveries. A leased row is pushed 10 minutes into
-- the future, so a crashed worker's rows are retried and two workers never
-- take the same row.
create function app.claim_notification_deliveries(p_limit integer default 20)
returns table (
  delivery_id uuid, channel text, attempts integer,
  notification_id uuid, type text, entity_type text, entity_id uuid, data jsonb, created_at timestamptz,
  user_id uuid, user_name text, user_email text
)
language sql volatile security definer set search_path = ''
as $$
  with due as (
    select d.id
    from public.notification_delivery d
    where d.status = 'antre' and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  ),
  leased as (
    update public.notification_delivery d
    set attempts = d.attempts + 1, next_attempt_at = now() + interval '10 minutes'
    from due
    where d.id = due.id
    returning d.id, d.channel, d.attempts, d.notification_id
  )
  select l.id, l.channel, l.attempts,
         n.id, n.type, n.entity_type, n.entity_id, n.data, n.created_at,
         u.id, u.name, u.email
  from leased l
  join public.notification n on n.id = l.notification_id
  join public.app_user u on u.id = n.user_id
$$;

-- Record the outcome of one attempt. A failure is retried with backoff
-- (1, 5, 15, 60 minutes) and given up after 5 attempts.
create function app.finish_notification_delivery(p_delivery_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_attempts integer;
  v_backoff interval[] := array['1 minute', '5 minutes', '15 minutes', '60 minutes']::interval[];
begin
  select attempts into v_attempts from public.notification_delivery where id = p_delivery_id for update;
  if not found then
    raise exception 'Pengiriman notifikasi tidak ditemukan.' using detail = 'not_found';
  end if;

  case p_status
    when 'terkirim' then
      update public.notification_delivery
      set status = 'terkirim', sent_at = now(), last_error = null
      where id = p_delivery_id;
    when 'dilewati' then
      update public.notification_delivery
      set status = 'dilewati', last_error = left(p_error, 500)
      where id = p_delivery_id;
    when 'gagal' then
      update public.notification_delivery
      set status = case when v_attempts >= 5 then 'gagal' else 'antre' end::public.notification_delivery_status,
          next_attempt_at = now() + v_backoff[least(greatest(v_attempts, 1), 4)],
          last_error = left(p_error, 500)
      where id = p_delivery_id;
    else
      raise exception 'Status pengiriman tidak dikenal: %', p_status using detail = 'invalid';
  end case;
end $$;

-- ---------------------------------------------------------------------------
-- Event: selisih (discrepancy)
-- ---------------------------------------------------------------------------
create function app.discrepancy_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_data jsonb;
  v_scanned_by uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'terbuka' or new.qty <= 0 then
      return new;
    end if;
    select jsonb_build_object(
             'discrepancy_id', new.id,
             'bundle_id',      b.id,
             'bundle_code',    b.code,
             'qty',            new.qty,
             'qty_sent',       m.qty_sent,
             'qty_received',   m.qty_sent - new.qty,
             'from_step',      new.from_step,
             'to_step',        new.to_step,
             'reason',         r.label,
             'receiver',       h.name
           ),
           m.scanned_by
      into v_data, v_scanned_by
    from public.bundle b
    join public.movement m on m.id = new.movement_id
    left join public.holder h on h.id = m.to_holder_id
    left join public.reason r on r.id = m.reason_id
    where b.id = new.bundle_id;

    perform app.notify('selisih.baru', 'discrepancy', new.id, v_data, v_scanned_by);
    return new;
  end if;

  -- UPDATE
  if new.status = 'selesai' and old.status = 'terbuka' then
    perform app.settle_notifications('discrepancy', new.id, 'Selisih sudah selesai.');
  elsif new.status = 'terbuka' and new.qty is distinct from old.qty then
    update public.notification
    set data = data || jsonb_build_object(
                 'qty', new.qty,
                 'qty_received', (data ->> 'qty_sent')::int - new.qty)
    where entity_type = 'discrepancy' and entity_id = new.id;
  end if;
  return new;
end $$;

create trigger discrepancy_notify
after insert or update of status, qty on public.discrepancy
for each row execute function app.discrepancy_notify();

-- ---------------------------------------------------------------------------
-- Public wrappers (PostgREST)
-- ---------------------------------------------------------------------------
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language sql security invoker set search_path = ''
as $$ select app.mark_notifications_read(p_ids) $$;

create function public.claim_notification_deliveries(p_limit integer default 20)
returns table (
  delivery_id uuid, channel text, attempts integer,
  notification_id uuid, type text, entity_type text, entity_id uuid, data jsonb, created_at timestamptz,
  user_id uuid, user_name text, user_email text
)
language sql security invoker set search_path = ''
as $$ select * from app.claim_notification_deliveries(p_limit) $$;

create function public.finish_notification_delivery(p_delivery_id uuid, p_status text, p_error text default null)
returns void language sql security invoker set search_path = ''
as $$ select app.finish_notification_delivery(p_delivery_id, p_status, p_error) $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.notification                 enable row level security;
alter table public.notification_channel_setting enable row level security;
alter table public.notification_delivery        enable row level security;

revoke all on public.notification, public.notification_channel_setting, public.notification_delivery
  from anon, authenticated;
-- Own inbox only; writes go through app.mark_notifications_read.
grant select on public.notification to authenticated;
create policy "own inbox" on public.notification for select to authenticated
  using (user_id = (select auth.uid()) and (select app.is_active_user()));

-- Channel switches: admin reads and toggles. Delivery queue: service role only.
grant select, update (is_enabled, updated_at) on public.notification_channel_setting to authenticated;
create policy "admin read" on public.notification_channel_setting for select to authenticated
  using ((select app.has_role('admin')));
create policy "admin update" on public.notification_channel_setting for update to authenticated
  using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

revoke all on function
  app.notification_recipients(text),
  app.notify(text, text, uuid, jsonb, uuid),
  app.settle_notifications(text, uuid, text),
  app.discrepancy_notify(),
  app.claim_notification_deliveries(integer),
  app.finish_notification_delivery(uuid, text, text),
  public.claim_notification_deliveries(integer),
  public.finish_notification_delivery(uuid, text, text)
  from public, anon, authenticated;
revoke all on function app.mark_notifications_read(uuid[]), public.mark_notifications_read(uuid[])
  from public, anon;
grant execute on function app.mark_notifications_read(uuid[]), public.mark_notifications_read(uuid[])
  to authenticated;
grant usage on schema app to service_role;
grant execute on function
  app.claim_notification_deliveries(integer),
  app.finish_notification_delivery(uuid, text, text),
  public.claim_notification_deliveries(integer),
  public.finish_notification_delivery(uuid, text, text)
  to service_role;

-- Live bell: stream the caller's own rows (Realtime applies the RLS above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notification;
  end if;
end $$;
