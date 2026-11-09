import { NextResponse, type NextRequest } from 'next/server';
import { callRpc } from '@/lib/rpc';
import { CSV_TABLES, reportCsv, type CsvTable, type Report } from '@/lib/report';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET /laporan/export?from=YYYY-MM-DD&to=YYYY-MM-DD&table=harian|penjahit|variant|alasan
// The database function checks the session and role; this only shapes the file.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  const table = q.get('table') as CsvTable;
  if (!ISO.test(from) || !ISO.test(to) || !CSV_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Parameter laporan tidak valid.' }, { status: 400 });
  }
  const res = await callRpc<Report>('production_report', { p_from: from, p_to: to });
  if (!res.ok) {
    const status = res.code === 'unauthenticated' ? 401 : res.code === 'forbidden_role' ? 403 : 400;
    return NextResponse.json({ error: res.message }, { status });
  }
  return new NextResponse(reportCsv(res.data, table), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="konveko-${table}-${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
