'use server';

import { refresh } from 'next/cache';
import { createClient, createServiceClient, getCurrentAppUser, type Role } from '@/lib/supabase/server';
import { dbError, done, fail, str, UUID, type FormState } from '@/lib/master';
import { normalizePhone, pinEmail } from '@/lib/phone';

// All master writes go through the signed-in user's client, so RLS
// ("admin insert/update" policies) is the real gate. The UI only hides forms.

async function upsert(table: string, id: string, values: Record<string, unknown>, what?: string): Promise<FormState> {
  const supabase = await createClient();
  const q = id
    ? supabase.from(table).update(values).eq('id', id).select('id')
    : supabase.from(table).insert(values).select('id');
  const { data, error } = await q;
  if (error) return fail(dbError(error, what));
  // RLS can silently filter an UPDATE to 0 rows instead of raising.
  if (!data || data.length === 0) return fail('Hanya admin yang bisa mengubah master data.');
  refresh();
  return done();
}

const idOf = (fd: FormData) => {
  const id = str(fd, 'id', 36);
  return id && UUID.test(id) ? id : '';
};

export async function saveVariant(_: FormState, fd: FormData): Promise<FormState> {
  const sku = str(fd, 'sku', 40).toUpperCase();
  const product_name = str(fd, 'product_name');
  const size = str(fd, 'size', 20);
  const color = str(fd, 'color', 40);
  if (!sku || !product_name || !size || !color) return fail('Isi SKU, nama produk, ukuran, dan warna.');
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(sku)) return fail('SKU hanya huruf, angka, dan tanda minus.');
  return upsert('product_variant', idOf(fd), { sku, product_name, size, color }, 'SKU');
}

export async function saveRoll(_: FormState, fd: FormData): Promise<FormState> {
  const code = str(fd, 'code', 40).toUpperCase();
  const material = str(fd, 'material');
  const color = str(fd, 'color', 40);
  const unit = str(fd, 'unit', 2);
  const amountRaw = str(fd, 'length_or_weight', 12).replace(',', '.');
  const amount = amountRaw === '' ? null : Number(amountRaw);
  const supplier = str(fd, 'supplier') || null;
  if (!code || !material || !color) return fail('Isi kode rol, bahan, dan warna.');
  if (amount !== null && !(amount > 0 && amount < 100000)) return fail('Panjang atau berat harus angka lebih dari 0.');
  if (amount !== null && !['m', 'kg'].includes(unit)) return fail('Pilih satuan m atau kg.');
  return upsert(
    'fabric_roll',
    idOf(fd),
    { code, material, color, length_or_weight: amount, unit: amount === null ? null : unit, supplier },
    'Kode rol',
  );
}

export async function saveHolder(_: FormState, fd: FormData): Promise<FormState> {
  const type = str(fd, 'type', 20);
  const name = str(fd, 'name');
  const phoneRaw = str(fd, 'phone', 20);
  if (!['produksi', 'penjahit', 'finishing', 'gudang'].includes(type)) return fail('Pilih jenis.');
  if (!name) return fail('Isi nama.');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return fail('Nomor HP tidak valid.');
  return upsert('holder', idOf(fd), { type, name, phone }, 'Nama');
}

export async function saveReason(_: FormState, fd: FormData): Promise<FormState> {
  const type = str(fd, 'type', 10);
  const code = str(fd, 'code', 30).toUpperCase().replace(/\s+/g, '_');
  const label = str(fd, 'label', 120);
  if (!['selisih', 'reject'].includes(type)) return fail('Pilih jenis alasan.');
  if (!code || !label) return fail('Isi kode dan label.');
  return upsert('reason', idOf(fd), { type, code, label }, 'Kode alasan');
}

const ACTIVE_TABLES = ['product_variant', 'holder', 'reason'] as const;

export async function setActive(table: (typeof ACTIVE_TABLES)[number], id: string, active: boolean): Promise<FormState> {
  if (!ACTIVE_TABLES.includes(table) || !UUID.test(id)) return fail('Data tidak valid.');
  return upsert(table, id, { is_active: active });
}

// ---------------------------------------------------------------------------
// Users (FR-04). Auth accounts need the service key; the caller is checked
// for the admin role first, and the app_user row is still written through
// the caller's own client so RLS applies.
// ---------------------------------------------------------------------------

const ROLES: Role[] = ['admin', 'produksi', 'penjahit', 'finishing', 'supervisor'];
const FLOOR: Role[] = ['penjahit', 'finishing'];

async function requireAdmin() {
  const me = await getCurrentAppUser();
  return me?.roles.includes('admin') ? me : null;
}

function parseRoles(fd: FormData): Role[] {
  return fd.getAll('roles').map(String).filter((r): r is Role => ROLES.includes(r as Role));
}

/** Penjahit/finishing need a holder. "auto" creates one named after the user. */
async function resolveHolder(fd: FormData, roles: Role[], name: string): Promise<{ id: string | null } | { error: string }> {
  const choice = str(fd, 'holder_id', 36);
  if (choice && choice !== 'auto') return UUID.test(choice) ? { id: choice } : { error: 'Pemegang tidak valid.' };
  if (choice === 'auto') {
    const type = roles.includes('finishing') ? 'finishing' : roles.includes('penjahit') ? 'penjahit' : 'produksi';
    const supabase = await createClient();
    const { data, error } = await supabase.from('holder').insert({ type, name }).select('id').single();
    if (error) return { error: dbError(error, 'Nama') };
    return { id: data.id };
  }
  if (roles.some((r) => FLOOR.includes(r))) return { error: 'Penjahit dan finishing wajib terhubung ke data pemegang.' };
  return { id: null };
}

export async function createUser(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await requireAdmin())) return fail('Hanya admin yang bisa menambah user.');
  const name = str(fd, 'name');
  const mode = str(fd, 'login', 10);
  const roles = parseRoles(fd);
  if (!name) return fail('Isi nama.');
  if (roles.length === 0) return fail('Pilih minimal satu role.');

  let email: string;
  let phone: string | null = null;
  let password: string;
  if (mode === 'pin') {
    phone = normalizePhone(str(fd, 'phone', 20));
    password = str(fd, 'secret', 6);
    if (!phone) return fail('Nomor HP tidak valid.');
    if (!/^\d{6}$/.test(password)) return fail('PIN harus 6 angka.');
    if (/^(\d)\1{5}$|^(012345|123456|234567|345678|456789|987654|654321)$/.test(password)) {
      return fail('PIN terlalu mudah ditebak. Hindari angka sama atau berurutan.');
    }
    email = pinEmail(phone);
  } else {
    email = str(fd, 'email', 120).toLowerCase();
    password = str(fd, 'secret', 72);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email tidak valid.');
    if (password.length < 8) return fail('Password minimal 8 karakter.');
  }

  const holder = await resolveHolder(fd, roles, name);
  if ('error' in holder) return fail(holder.error);

  const service = createServiceClient();
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    return fail(/already|registered|exists/i.test(created.error?.message ?? '') ? 'Email atau nomor HP sudah terdaftar.' : 'Gagal membuat akun.');
  }

  const supabase = await createClient();
  const { error } = await supabase.from('app_user').insert({
    id: created.data.user.id,
    name,
    email,
    phone,
    roles,
    holder_id: holder.id,
  });
  if (error) {
    await service.auth.admin.deleteUser(created.data.user.id); // keep auth and app_user in sync
    return fail(dbError(error, 'Email atau nomor HP'));
  }
  refresh();
  return done();
}

export async function updateUser(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin();
  if (!me) return fail('Hanya admin yang bisa mengubah user.');
  const id = idOf(fd);
  const name = str(fd, 'name');
  const roles = parseRoles(fd);
  if (!id || !name) return fail('Isi nama.');
  if (roles.length === 0) return fail('Pilih minimal satu role.');
  if (id === me.id && !roles.includes('admin')) return fail('Anda tidak bisa mencabut role admin dari akun sendiri.');
  const holder = await resolveHolder(fd, roles, name);
  if ('error' in holder) return fail(holder.error);
  return upsert('app_user', id, { name, roles, holder_id: holder.id });
}

export async function resetSecret(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await requireAdmin())) return fail('Hanya admin yang bisa mengganti PIN atau password.');
  const id = idOf(fd);
  const secret = str(fd, 'secret', 72);
  const supabase = await createClient();
  const { data: target } = await supabase.from('app_user').select('id, phone').eq('id', id).maybeSingle();
  if (!target) return fail('User tidak ditemukan.');
  if (target.phone) {
    if (!/^\d{6}$/.test(secret)) return fail('PIN harus 6 angka.');
  } else if (secret.length < 8) return fail('Password minimal 8 karakter.');

  const { error } = await createServiceClient().auth.admin.updateUserById(id, { password: secret });
  if (error) return fail('Gagal mengganti. Coba lagi.');
  return done();
}

export async function setUserActive(id: string, active: boolean): Promise<FormState> {
  const me = await requireAdmin();
  if (!me) return fail('Hanya admin yang bisa menonaktifkan user.');
  if (!UUID.test(id)) return fail('User tidak valid.');
  if (id === me.id && !active) return fail('Anda tidak bisa menonaktifkan akun sendiri.');
  const res = await upsert('app_user', id, { is_active: active });
  if (!res.ok) return res;
  // Block sign-in at the auth layer too (existing tokens already fail RLS: is_active = false).
  await createServiceClient().auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
  return res;
}
