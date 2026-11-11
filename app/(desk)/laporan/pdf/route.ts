import { NextResponse, type NextRequest } from 'next/server';
import { loadBusinessProfile } from '@/lib/business';
import { resolvePeriod, type OutboundReport, type Report } from '@/lib/report';
import { renderReportPdf } from '@/lib/report-pdf';
import { callRpc } from '@/lib/rpc';

// GET /laporan/pdf?mode=week|month|custom&date=...&from=...&to=...
// Same params as /laporan, resolved by the same resolvePeriod, so the PDF is
// exactly the period on screen. The database functions check session and role.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const period = resolvePeriod({
    mode: q.get('mode') ?? undefined,
    date: q.get('date') ?? undefined,
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
  });

  const [cur, prev, out, outPrev, business] = await Promise.all([
    callRpc<Report>('production_report', { p_from: period.from, p_to: period.to }),
    callRpc<Report>('production_report', { p_from: period.prevFrom, p_to: period.prevTo }),
    callRpc<OutboundReport>('outbound_report', { p_from: period.from, p_to: period.to }),
    callRpc<OutboundReport>('outbound_report', { p_from: period.prevFrom, p_to: period.prevTo }),
    loadBusinessProfile(),
  ]);
  if (!cur.ok || !prev.ok) {
    const res = !cur.ok ? cur : (prev as Extract<typeof prev, { ok: false }>);
    const status = res.code === 'unauthenticated' ? 401 : res.code === 'forbidden_role' ? 403 : 400;
    return NextResponse.json({ error: res.message }, { status });
  }

  const pdf = await renderReportPdf({
    period,
    r: cur.data,
    prev: prev.data,
    out: out.ok ? out.data : null,
    outPrev: outPrev.ok ? outPrev.data : null,
    business: business.name,
    // The environment this was printed from (localhost, preview, production)
    appUrl: req.nextUrl.origin,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="konveko-laporan-${period.from}_${period.to}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
