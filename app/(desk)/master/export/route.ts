import { loadExisting } from '@/lib/master-existing';
import { buildWorkbook } from '@/lib/master-xlsx';
import { getCurrentAppUser } from '@/lib/supabase/server';

/**
 * GET /master/export            all importable master data as .xlsx (admin only)
 * GET /master/export?template=1 the same workbook without data
 */
export async function GET(request: Request) {
  const me = await getCurrentAppUser();
  if (!me?.roles.includes('admin')) return new Response('Hanya admin yang bisa export master data.', { status: 403 });

  const template = new URL(request.url).searchParams.get('template') === '1';
  const body = await buildWorkbook(template ? null : await loadExisting());
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const name = template ? 'konveko-master-template.xlsx' : `konveko-master-${day}.xlsx`;

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
