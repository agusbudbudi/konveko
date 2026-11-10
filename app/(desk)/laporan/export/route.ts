import { NextResponse, type NextRequest } from 'next/server';
import { callRpc } from '@/lib/rpc';
import { CSV_TABLES, isOutboundTable, outboundCsv, reportCsv, type CsvTable, type OutboundReport, type Report } from '@/lib/report';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET /laporan/export?from=YYYY-MM-DD&to=YYYY-MM-DD&table=harian|penjahit|variant|alasan|keluar_tujuan|keluar_variant
// The database function checks the session and role; this only shapes the file.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  const table = q.get('table') as CsvTable;
  if (!ISO.test(from) || !ISO.test(to) || !CSV_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Parameter laporan tidak valid.' }, { status: 400 });
  }
  const fail = (res: { message: string; code: string | null }) =>
    NextResponse.json({ error: res.message }, { status: res.code === 'unauthenticated' ? 401 : res.code === 'forbidden_role' ? 403 : 400 });
  let body: string;
  if (isOutboundTable(table)) {
    const res = await callRpc<OutboundReport>('outbound_report', { p_from: from, p_to: to });
    if (!res.ok) return fail(res);
    body = outboundCsv(res.data, table);
  } else {
    const res = await callRpc<Report>('production_report', { p_from: from, p_to: to });
    if (!res.ok) return fail(res);
    body = reportCsv(res.data, table);
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="konveko-${table}-${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
