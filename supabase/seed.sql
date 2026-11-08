-- Default reason master data (FR-04a). Safe to re-run.
insert into public.reason (type, code, label) values
  ('selisih', 'KURANG_HITUNG', 'Potongan kurang saat diserahkan'),
  ('selisih', 'HILANG',        'Hilang saat dipindah'),
  ('selisih', 'SALAH_BUNDLE',  'Tercampur ke bundle lain'),
  ('reject',  'JAHITAN',       'Jahitan rusak atau miring'),
  ('reject',  'KAIN_CACAT',    'Kain cacat atau bolong'),
  ('reject',  'NODA',          'Noda atau kotor'),
  ('reject',  'UKURAN',        'Ukuran tidak sesuai')
on conflict (type, code) do nothing;

-- Default holders
insert into public.holder (type, name)
select v.type::public.holder_type, v.name
from (values ('produksi', 'Tim produksi'), ('finishing', 'Tim finishing'), ('gudang', 'Gudang')) as v(type, name)
where not exists (select 1 from public.holder h where h.name = v.name);
