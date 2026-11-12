import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');

// Storage needs the Supabase storage schema, which PGlite does not have.
const SKIP = [/_storage_/];

export async function createDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !SKIP.some((re) => re.test(f)))
    .sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }
  await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));
  return db;
}

/** Act as a given auth user for subsequent queries on this connection. */
export async function actAs(db, userId) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
}

/** Call a public RPC as a user. Returns the jsonb result. */
export async function rpc(db, userId, fn, args) {
  await actAs(db, userId);
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  const res = await db.query(sql, Object.values(args));
  return res.rows[0].r;
}

export async function one(db, sql, params = []) {
  const res = await db.query(sql, params);
  return res.rows[0];
}

export async function all(db, sql, params = []) {
  return (await db.query(sql, params)).rows;
}

/** Fixture: users, holders, variants, roll. Returns ids. */
export async function seedFixture(db) {
  const ids = {};
  const holder = async (key, type, name) => {
    ids[key] = (await one(db, `insert into public.holder (type, name) values ($1, $2) returning id`, [type, name])).id;
  };
  await holder('hProduksi', 'produksi', 'Produksi A');
  await holder('hAni', 'penjahit', 'Ani');
  await holder('hBudi', 'penjahit', 'Budi');
  await holder('hFinishing', 'finishing', 'Finishing A');

  const user = async (key, name, roles, holderKey) => {
    const id = (await one(db, `insert into auth.users (id) values (gen_random_uuid()) returning id`)).id;
    await db.query(
      `insert into public.app_user (id, name, roles, holder_id) values ($1, $2, $3::public.app_role[], $4)`,
      [id, name, `{${roles.join(',')}}`, holderKey ? ids[holderKey] : null],
    );
    ids[key] = id;
  };
  await user('admin', 'Admin', ['admin']);
  await user('produksi', 'Petugas produksi', ['produksi'], 'hProduksi');
  await user('ani', 'Ani', ['penjahit'], 'hAni');
  await user('budi', 'Budi', ['penjahit'], 'hBudi');
  await user('finishing', 'Petugas finishing', ['finishing'], 'hFinishing');
  await user('spv', 'Supervisor', ['supervisor', 'admin']);
  await user('gudang', 'Petugas gudang', ['gudang']);

  const loc = async (key, code, kind) => {
    ids[key] = (await one(db, `insert into public.location (code, kind) values ($1, $2) returning id`, [code, kind])).id;
  };
  await loc('rakA1', 'A1', 'stok');
  await loc('rakA2', 'A2', 'stok');
  await loc('rakRJ', 'RJ1', 'reject');

  const variant = async (key, sku, size) => {
    ids[key] = (await one(db,
      `insert into public.product_variant (sku, product_name, size, color) values ($1, 'Kemeja', $2, 'Putih') returning id`,
      [sku, size])).id;
  };
  await variant('kemejaM', 'KMJ-PTH-M', 'M');
  await variant('kemejaL', 'KMJ-PTH-L', 'L');
  await variant('kemejaXL', 'KMJ-PTH-XL', 'XL');

  ids.roll = (await one(db,
    `insert into public.fabric_roll (code, material, color, length_or_weight, unit, supplier)
     values ('R-001', 'Katun', 'Putih', 50, 'm', 'Toko Kain') returning id`)).id;

  ids.rSelisih = (await one(db, `select id from public.reason where type = 'selisih' and code = 'KURANG_HITUNG'`)).id;
  ids.rReject = (await one(db, `select id from public.reason where type = 'reject' and code = 'JAHITAN'`)).id;
  return ids;
}

/**
 * Global invariants. Returns a list of human-readable violations (empty = ok).
 */
export async function checkInvariants(db) {
  await actAs(db, null);
  const problems = [];

  // Rework: reject is net of what went to rework; those pcs live on in the rework children.
  const unbalanced = await all(db, `
    select code, target_qty, ready, reject, wip_menunggu, wip_dikerjakan, selisih, reworked
    from public.bundle_reconciliation
    where is_active and target_qty <> ready + reject + wip_menunggu + wip_dikerjakan + selisih + reworked`);
  for (const r of unbalanced) problems.push(`unbalanced ${r.code}: ${JSON.stringify(r)}`);

  const reworkKids = await all(db, `
    select r.code, r.reworked,
           coalesce((select sum(c.target_qty) from public.bundle c
                     where c.rework_of_bundle_id = r.bundle_id and c.cancelled_at is null
                       and c.rework_source <> 'retur'), 0)::int as kids
    from public.bundle_reconciliation r`);
  for (const r of reworkKids) if (r.reworked !== r.kids) problems.push(`reworked vs children ${r.code}: ${r.reworked} vs ${r.kids}`);

  const drift = await all(db, `
    select b.code, b.current_status, r.status, b.current_qty, r.ref_qty, b.current_holder_id, r.holder_id
    from public.bundle b join public.bundle_reconciliation r on r.bundle_id = b.id
    where b.current_status <> r.status or b.current_qty <> r.ref_qty
       or b.current_holder_id is distinct from r.holder_id`);
  for (const r of drift) problems.push(`projection drift ${r.code}: ${JSON.stringify(r)}`);

  const stock = await all(db, `
    select r.code, r.ready, coalesce(sum(sl.qty), 0)::int as ledger
    from public.bundle_reconciliation r
    left join public.stock_ledger sl on sl.bundle_id = r.bundle_id
    where r.rework_source is distinct from 'retur'
    group by r.bundle_id, r.code, r.ready
    having r.ready <> coalesce(sum(sl.qty), 0)`);
  for (const r of stock) problems.push(`stock mismatch ${r.code}: ready ${r.ready} vs ledger ${r.ledger}`);

  const conserved = await all(db, `
    select pb.code, br.target,
           (select sum(target_qty) from public.bundle b where b.batch_id = pb.id and b.parent_bundle_id is null and b.rework_of_bundle_id is null)::int as cut
    from public.production_batch pb join public.batch_reconciliation br on br.batch_id = pb.id
    where br.target <> (select sum(target_qty) from public.bundle b where b.batch_id = pb.id and b.parent_bundle_id is null and b.rework_of_bundle_id is null)`);
  for (const r of conserved) problems.push(`batch target changed ${r.code}: ${r.target} vs cut ${r.cut}`);

  // Voided receives keep their flag row with qty 0, so a plain sum must match.
  const flags = await all(db, `
    select r.code, r.selisih, coalesce(sum(d.qty), 0)::int as flagged
    from public.bundle_reconciliation r
    left join public.discrepancy d on d.bundle_id = r.bundle_id
    group by r.bundle_id, r.code, r.selisih
    having r.selisih <> coalesce(sum(d.qty), 0)`);
  for (const r of flags) problems.push(`discrepancy mismatch ${r.code}: selisih ${r.selisih} vs flagged ${r.flagged}`);

  // Fase 2a/2b: one piece per finished good / reject pcs; shipped ('keluar') pieces still count as produced.
  // Rework: a good piece in rework (damaged return) still counts as produced; a reject piece in rework
  // left the net reject; reject_awal counts it.
  const pieces = await all(db, `
    select r.code, r.ready, r.reject, r.reject_awal,
           count(p.id) filter (where p.grade = 'baik')::int   as baik,
           count(p.id) filter (where p.grade = 'reject' and p.status <> 'rework')::int as rej,
           count(p.id) filter (where p.grade = 'reject')::int as rej_awal
    from public.bundle_reconciliation r
    left join public.piece p on p.bundle_id = r.bundle_id and p.status in ('aktif', 'keluar', 'rework')
    group by r.bundle_id, r.code, r.ready, r.reject, r.reject_awal
    having r.ready <> count(p.id) filter (where p.grade = 'baik')
        or r.reject <> count(p.id) filter (where p.grade = 'reject' and p.status <> 'rework')
        or r.reject_awal <> count(p.id) filter (where p.grade = 'reject')`);
  for (const r of pieces) problems.push(`piece mismatch ${r.code}: ${JSON.stringify(r)}`);

  const ledger = await all(db, `
    select pv.sku, coalesce((select sum(qty) from public.stock_ledger sl where sl.variant_id = pv.id), 0)::int as ledger,
           (select count(*) from public.piece p
             join public.bundle b on b.id = p.bundle_id and b.rework_source is distinct from 'retur'
            where p.variant_id = pv.id and p.status in ('aktif', 'keluar', 'rework') and p.grade = 'baik'
              and p.origin = 'produksi')::int as baik
    from public.product_variant pv`);
  for (const r of ledger) if (r.ledger !== r.baik) problems.push(`ledger vs pieces ${r.sku}: ${r.ledger} vs ${r.baik}`);

  const pdrift = await all(db, `
    select p.code, p.location_id, last.to_location_id
    from public.piece p
    left join lateral (
      select e.type, e.to_location_id from public.piece_event e
      where e.piece_id = p.id and e.type in ('masuk_rak', 'pindah_rak', 'keluar_rak', 'batal', 'keluar', 'retur', 'rework', 'batal_rework', 'stok_awal')
      order by e.seq desc limit 1
    ) last on true
    where p.location_id is distinct from (case when last.type in ('masuk_rak', 'pindah_rak', 'batal_rework', 'stok_awal') then last.to_location_id end)`);
  for (const r of pdrift) problems.push(`piece location drift ${r.code}`);

  const wrongKind = await all(db, `
    select p.code from public.piece p join public.location l on l.id = p.location_id
    where (p.grade = 'baik' and p.condition = 'baik') <> (l.kind = 'stok')`);
  for (const r of wrongKind) problems.push(`piece on wrong rack kind ${r.code}`);

  // Fase 2b: outbound documents
  const odrift = await all(db, `
    select p.code, p.status, p.outbound_id, i.outbound_id as item_doc, o.status as doc_status
    from public.piece p
    left join public.outbound_item i on i.piece_id = p.id and i.returned_at is null
    left join public.outbound o on o.id = i.outbound_id
    where p.outbound_id is distinct from i.outbound_id
       or (p.status = 'keluar') <> (o.status is not distinct from 'dikirim')
       or (o.status = 'draft' and p.status <> 'aktif')`);
  for (const r of odrift) problems.push(`outbound drift ${r.code}: ${JSON.stringify(r)}`);

  const shippedOnRack = await all(db, `select code from public.piece where status = 'keluar' and location_id is not null`);
  for (const r of shippedOnRack) problems.push(`shipped piece on a rack ${r.code}`);

  const stockView = await all(db, `
    select pv.sku,
           coalesce((select sum(qty) from public.stock_location s where s.variant_id = pv.id), 0)::int as view_qty,
           (select count(*) from public.piece p where p.variant_id = pv.id and p.status = 'aktif')::int as aktif
    from public.product_variant pv`);
  for (const r of stockView) if (r.view_qty !== r.aktif) problems.push(`stock view vs active pieces ${r.sku}: ${r.view_qty} vs ${r.aktif}`);

  // Fase 2c: a rack is in at most one open count; a closed count holds no lock
  const locks = await all(db, `
    select c.code, c.status from public.stock_count c
    join public.stock_count_location cl on cl.count_id = c.id
    where cl.is_open <> (c.status in ('menghitung', 'review'))`);
  for (const r of locks) problems.push(`stock count lock drift ${r.code} (${r.status})`);

  return problems;
}
