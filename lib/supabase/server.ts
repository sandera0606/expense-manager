import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// =============================================================================
// Server-side Supabase client. Use from Server Components, Server Actions,
// Route Handlers, and Layouts that need authed reads.
//
// Important Next.js 16 detail: `cookies()` returns a Promise. The wrapping
// helpers below await it.
// =============================================================================

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll called from a Server Component is a no-op — proxy.ts
            // handles session refresh on every request, so missing sets here
            // are fine.
          }
        },
      },
    }
  );
}
