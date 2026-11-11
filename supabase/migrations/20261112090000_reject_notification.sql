-- Notification type reject.baru (doc/PRD Notifikasi.md): a finish scan
-- (jahit or finishing) with reject pcs notifies active admins and supervisors.
-- Corrections keep it current: new numbers, or settled when the reject
-- becomes 0 or the scan is voided. Entity = the original finish movement.

create or replace function app.notification_recipients(p_type text)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select u.id
  from public.app_user u
  where u.is_active
    and case p_type
          when 'selisih.baru' then u.roles && array['supervisor', 'admin']::public.app_role[]
          when 'reject.baru'  then u.roles && array['supervisor', 'admin']::public.app_role[]
          else false
        end
$$;

insert into public.notification_channel_setting (type, channel, is_enabled)
values ('reject.baru', 'email', false);

-- Event data for a finish movement with the given (possibly corrected) numbers.
create function app.reject_notification_data(
  p_movement_id uuid, p_qty_good integer, p_qty_reject integer, p_reason_id uuid
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'bundle_id',    b.id,
    'bundle_code',  b.code,
    'step',         case m.type when 'finish_sew' then 'jahit' else 'finishing' end,
    'qty_in',       coalesce(m.qty_received, p_qty_good + p_qty_reject),
    'qty_good',     p_qty_good,
    'qty_reject',   p_qty_reject,
    'reason',       r.label,
    'worker',       h.name
  )
  from public.movement m
  join public.bundle b on b.id = m.bundle_id
  left join public.holder h on h.id = m.to_holder_id
  left join public.reason r on r.id = p_reason_id
  where m.id = p_movement_id
$$;

create function app.movement_reject_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o public.movement;
begin
  if new.type in ('finish_sew', 'finish_finishing') then
    if coalesce(new.qty_reject, 0) > 0 then
      perform app.notify('reject.baru', 'movement', new.id,
        app.reject_notification_data(new.id, new.qty_good, new.qty_reject, new.reason_id),
        new.scanned_by);
    end if;
    return new;
  end if;

  if new.type <> 'correction' then
    return new;
  end if;
  select * into o from public.movement where id = new.corrects_movement_id;
  if not found or o.type not in ('finish_sew', 'finish_finishing') then
    return new;
  end if;

  if new.is_void or coalesce(new.qty_reject, 0) = 0 then
    perform app.settle_notifications('movement', o.id, 'Reject dikoreksi atau scan dibatalkan.');
  elsif exists (select 1 from public.notification where entity_type = 'movement' and entity_id = o.id) then
    update public.notification
    set data = app.reject_notification_data(o.id, new.qty_good, new.qty_reject, new.reason_id)
    where entity_type = 'movement' and entity_id = o.id;
  else
    -- The original scan had no reject; the correction adds some.
    perform app.notify('reject.baru', 'movement', o.id,
      app.reject_notification_data(o.id, new.qty_good, new.qty_reject, new.reason_id),
      o.scanned_by);
  end if;
  return new;
end $$;

create trigger movement_reject_notify
after insert on public.movement
for each row execute function app.movement_reject_notify();

revoke all on function
  app.reject_notification_data(uuid, integer, integer, uuid),
  app.movement_reject_notify()
  from public, anon, authenticated;
