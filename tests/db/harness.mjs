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

  const unbalanced = await all(db, `
    select code, target_qty, ready, reject, wip_menunggu, wip_dikerjakan, selisih
    from public.bundle_reconciliation
    where is_active and target_qty <> ready + reject + wip_menunggu + wip_dikerjakan + selisih`);
  for (const r of unbalanced) problems.push(`unbalanced ${r.code}: ${JSON.stringify(r)}`);

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
    group by r.bundle_id, r.code, r.ready
    having r.ready <> coalesce(sum(sl.qty), 0)`);
  for (const r of stock) problems.push(`stock mismatch ${r.code}: ready ${r.ready} vs ledger ${r.ledger}`);

  const conserved = await all(db, `
    select pb.code, br.target,
           (select sum(target_qty) from public.bundle b where b.batch_id = pb.id and b.parent_bundle_id is null)::int as cut
    from public.production_batch pb join public.batch_reconciliation br on br.batch_id = pb.id
    where br.target <> (select sum(target_qty) from public.bundle b where b.batch_id = pb.id and b.parent_bundle_id is null)`);
  for (const r of conserved) problems.push(`batch target changed ${r.code}: ${r.target} vs cut ${r.cut}`);

  // Voided receives keep their flag row with qty 0, so a plain sum must match.
  const flags = await all(db, `
    select r.code, r.selisih, coalesce(sum(d.qty), 0)::int as flagged
    from public.bundle_reconciliation r
    left join public.discrepancy d on d.bundle_id = r.bundle_id
    group by r.bundle_id, r.code, r.selisih
    having r.selisih <> coalesce(sum(d.qty), 0)`);
  for (const r of flags) problems.push(`discrepancy mismatch ${r.code}: selisih ${r.selisih} vs flagged ${r.flagged}`);

  return problems;
}
