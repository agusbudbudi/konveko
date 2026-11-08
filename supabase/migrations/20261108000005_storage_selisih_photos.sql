-- Konveko MVP: storage for optional selisih photos (FR-13)
-- Path convention: <auth.uid()>/<uuid>.jpg  (client compresses to ~300 KB)
-- Not exercised by the PGlite tests (no storage schema there).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selisih-photos', 'selisih-photos', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Upload only into your own folder. Plain insert (no upsert), so no UPDATE policy.
create policy "staff upload own selisih photo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'selisih-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select app.is_active_user())
);

create policy "staff read selisih photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'selisih-photos'
  and (select app.is_active_user())
);
