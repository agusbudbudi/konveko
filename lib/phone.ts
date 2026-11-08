/** Normalize an Indonesian phone number to 62xxxxxxxxx, or null if invalid. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return /^628\d{7,11}$/.test(d) ? d : null;
}

export function pinEmail(phone: string) {
  return `${phone}@${process.env.PIN_EMAIL_DOMAIN ?? 'pin.konveko.internal'}`;
}
