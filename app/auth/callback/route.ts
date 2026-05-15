import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Magic-link callback. Supabase emails a link of the form
//   <site>/auth/callback?code=XYZ
// We exchange the code for a session cookie, then redirect to /feed
// (or `next=...` if specified).
// =============================================================================

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/feed';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }
  return NextResponse.redirect(`${origin}${next}`);
}
