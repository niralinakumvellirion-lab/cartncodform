import { NextResponse } from 'next/server';
import { resolveHostRoute } from './lib/hostRouting';

export function middleware(request) {
  const host      = request.headers.get('host') || '';
  const pathname  = request.nextUrl.pathname;
  const isProd    = process.env.NODE_ENV === 'production';

  const result = resolveHostRoute({ host, pathname, isProduction: isProd });

  if (result.action === 'notFound') {
    return new NextResponse(null, { status: 404 });
  }

  if (result.action === 'rewrite') {
    const url = request.nextUrl.clone();
    url.pathname = result.to;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *  - _next/static  (compiled client bundles)
     *  - _next/image   (Next.js image optimisation)
     *  - favicon.ico, robots.txt, sitemap.xml
     *  - files with common static extensions
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot)).*)',
  ],
};
