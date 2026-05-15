import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// =============================================================================
// Next.js 16 renamed middleware.ts → proxy.ts. Same purpose: this runs on
// every request, refreshes the Supabase session cookie, and lets RSC handlers
// see a valid session.
//
// Auth gating is handled in Server Components via lib/auth/dal.ts. This proxy
// only refreshes the cookie. Routes in `matcher` skip static assets.
// =============================================================================

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Call getUser to trigger a session refresh if needed. Per Supabase docs,
  // getSession() is not safe here (does not validate) — always use getUser().
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on everything except: Next internals, static assets, image optimisations.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
