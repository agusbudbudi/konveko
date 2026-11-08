'use client';

import { getBrowserClient } from '@/lib/supabase/client';

const MAX_EDGE = 1280;
const QUALITY = 0.7;

/** Downscale + JPEG-encode a camera photo to roughly 150-300 KB. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', QUALITY),
  );
}

/** Upload to selisih-photos/<userId>/<uuid>.jpg (path enforced by storage RLS). Returns the path. */
export async function uploadSelisihPhoto(userId: string, file: File): Promise<string> {
  const blob = await compressPhoto(file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await getBrowserClient()
    .storage.from('selisih-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
