// Creates local test accounts, sample master data, and one batch to scan.
// Usage:  node --env-file=.env.local scripts/create-dev-users.mjs
// Refuses to run against anything other than a local Supabase.
//
// Test credentials (local development only):
//
//   Role                   Login                     Secret
//   admin + supervisor     admin@konveko.test        dev-admin-123   (email + password)
//   produksi               produksi@konveko.test     dev-produksi-123
//   penjahit (Ani)         HP 0811 0000 001          PIN 111111
//   penjahit (Budi)        HP 0811 0000 002          PIN 222222
//   finishing              HP 0811 0000 003          PIN 333333
//   gudang                 HP 0811 0000 009          PIN 444444

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const pinDomain = process.env.PIN_EMAIL_DOMAIN ?? 'pin.konveko.internal';

if (!url || !secret || !publishable) {
  console.error('Isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY di .env.local');
  process.exit(1);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
  console.error(`Menolak jalan: ${url} bukan Supabase lokal. Skrip ini hanya untuk development.`);
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const holders = {
  produksi: { type: 'produksi', name: 'Tim produksi' },
  ani: { type: 'penjahit', name: 'Ani' },
  budi: { type: 'penjahit', name: 'Budi' },
  finishing: { type: 'finishing', name: 'Tim finishing' },
};

const users = [
  { name: 'Admin', email: 'admin@konveko.test', password: 'dev-admin-123', roles: ['admin', 'supervisor'] },
  { name: 'Petugas produksi', email: 'produksi@konveko.test', password: 'dev-produksi-123', roles: ['produksi'], holder: 'produksi' },
  { name: 'Ani', phone: '628110000001', pin: '111111', roles: ['penjahit'], holder: 'ani' },
  { name: 'Budi', phone: '628110000002', pin: '222222', roles: ['penjahit'], holder: 'budi' },
  { name: 'Petugas finishing', phone: '628110000003', pin: '333333', roles: ['finishing'], holder: 'finishing' },
  { name: 'Petugas gudang', phone: '628110000009', pin: '444444', roles: ['gudang'] },
];

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function holderId(key) {
  const h = holders[key];
  const found = await must(admin.from('holder').select('id').eq('name', h.name).maybeSingle(), `cari holder ${h.name}`);
  if (found) return found.id;
  return (await must(admin.from('holder').insert(h).select('id').single(), `buat holder ${h.name}`)).id;
}

async function ensureUser(u) {
  const email = u.email ?? `${u.phone}@${pinDomain}`;
  const password = u.password ?? u.pin;
  const existing = await must(admin.from('app_user').select('id').eq('email', email).maybeSingle(), 'cari user');
  if (existing) return existing.id;

  const created = await must(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
    `buat auth user ${email}`,
  );
  await must(
    admin.from('app_user').insert({
      id: created.user.id,
      name: u.name,
      email,
      phone: u.phone ?? null,
      roles: u.roles,
      holder_id: u.holder ? await holderId(u.holder) : null,
    }),
    `buat app_user ${email}`,
  );
  return created.user.id;
}

for (const u of users) {
  await ensureUser(u);
  console.log(`✓ ${u.name}`);
}

// Sample master data
const variants = [
  { sku: 'KMJ-PTH-M', product_name: 'Kemeja', size: 'M', color: 'Putih' },
  { sku: 'KMJ-PTH-L', product_name: 'Kemeja', size: 'L', color: 'Putih' },
  { sku: 'KMJ-PTH-XL', product_name: 'Kemeja', size: 'XL', color: 'Putih' },
];
await must(admin.from('product_variant').upsert(variants, { onConflict: 'sku' }), 'buat variant');
await must(
  admin.from('fabric_roll').upsert(
    { code: 'R-DEV-001', material: 'Katun', color: 'Putih', length_or_weight: 50, unit: 'm', supplier: 'Contoh' },
    { onConflict: 'code' },
  ),
  'buat rol',
);

// Racks: two for good stock, one for rejects
await must(
  admin.from('location').upsert(
    [
      { code: 'A1', kind: 'stok' },
      { code: 'A2', kind: 'stok' },
      { code: 'RJ1', kind: 'reject', note: 'Barang reject' },
    ],
    { onConflict: 'code' },
  ),
  'buat rak',
);

// One batch (20 M, 15 L, 15 XL = 50 pcs), created through the real RPC as the produksi user
const asProduksi = createClient(url, publishable, { auth: { persistSession: false } });
await must(asProduksi.auth.signInWithPassword({ email: 'produksi@konveko.test', password: 'dev-produksi-123' }), 'login produksi');
const roll = await must(admin.from('fabric_roll').select('id').eq('code', 'R-DEV-001').single(), 'ambil rol');
const ids = Object.fromEntries(
  (await must(admin.from('product_variant').select('id, sku'), 'ambil variant')).map((v) => [v.sku, v.id]),
);
const batch = await must(
  asProduksi.rpc('create_batch', {
    p_fabric_roll_id: roll.id,
    p_items: [
      { variant_id: ids['KMJ-PTH-M'], qty: 20 },
      { variant_id: ids['KMJ-PTH-L'], qty: 15 },
      { variant_id: ids['KMJ-PTH-XL'], qty: 15 },
    ],
  }),
  'buat batch',
);

console.log(`\nBatch ${batch.code} siap. Ketik kode ini di /scan:`);
for (const b of batch.bundles) console.log(`  ${b.code}  (${b.qty} pcs)`);
