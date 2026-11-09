// Creates the first admin (admin + supervisor) on a hosted Supabase project.
//
//   node --env-file=.env.production.local scripts/create-admin.mjs
//
// The env file needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY of the
// target project (it is gitignored). Name, email, and password are asked in
// the terminal; the password is not echoed and is never written anywhere.

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY di env file project tujuan.');
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // print the prompt once, then swallow the typed characters
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

console.log(`Project: ${new URL(url).host}`);
const { count } = await admin.from('app_user').select('id', { count: 'exact', head: true }).contains('roles', ['admin']);
if (count) console.log(`Catatan: sudah ada ${count} admin. Skrip ini menambah satu lagi.`);

const name = await ask('Nama admin: ');
const email = (await ask('Email: ')).toLowerCase();
const password = await ask('Password (min 12 karakter, tidak ditampilkan): ', { hidden: true });
const again = await ask('Ulangi password: ', { hidden: true });

if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Nama dan email wajib diisi dengan benar.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Password minimal 12 karakter.');
  process.exit(1);
}
if (password !== again) {
  console.error('Password tidak sama.');
  process.exit(1);
}

const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error(`Gagal membuat akun: ${error.message}`);
  process.exit(1);
}

const { error: rowError } = await admin
  .from('app_user')
  .insert({ id: created.user.id, name, email, roles: ['admin', 'supervisor'] });
if (rowError) {
  await admin.auth.admin.deleteUser(created.user.id); // do not leave a login without a profile
  console.error(`Gagal menyimpan profil, akun dibatalkan: ${rowError.message}`);
  process.exit(1);
}

console.log(`✓ Admin ${name} (${email}) dibuat dengan role admin + supervisor. Silakan login.`);
