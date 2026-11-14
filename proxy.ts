import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Public and session-free: served as-is with no Supabase round trip, so the landing page and the files
// link previews and crawlers fetch stay static and fast. The landing page reads the session in the browser.
const STATIC_PUBLIC = ['/', '/robots.txt', '/sitemap.xml'];
const isStaticPublic = (path: string) => STATIC_PUBLIC.includes(path) || path.startsWith('/opengraph-image');

const PUBLIC_PATHS = [
  '/login',
  '/manifest.webmanifest',
  '/api/cron', // Vercel Cron, guarded by CRON_SECRET in each route
  ...(process.env.NODE_ENV === 'development' ? ['/dev'] : []),
];

// Refreshes the Supabase session cookie on every request and sends
// signed-out visitors to /login. Authorization is still enforced by RLS
// and the database functions; this is only for navigation.
export async function proxy(request: NextRequest) {
  if (isStaticPublic(request.nextUrl.pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|wasm)$).*)'],
};
