-- Fase 2b: storage for the business logo printed on the surat jalan header.
-- Path convention: logo/<uuid>.<ext>; business_profile.logo_path points at the current one.
-- Not exercised by the PGlite tests (no storage schema there).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-assets', 'business-assets', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "admin upload business assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'business-assets' and (select app.has_role('admin')));

create policy "admin delete business assets"
on storage.objects for delete to authenticated
using (bucket_id = 'business-assets' and (select app.has_role('admin')));

create policy "staff read business assets"
on storage.objects for select to authenticated
using (bucket_id = 'business-assets' and (select app.is_active_user()));
