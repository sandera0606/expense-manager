import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// OTP/magic-link confirmation. Called by the phone after /pair/<code> hands
// off a hashed_token. Verifies it against Supabase server-side via
// verifyOtp(); on success the SSR client's cookie adapter writes the
// sb-*-auth-token cookies on the phone's browser, and we redirect into the
// app.
//
// Distinct from /auth/callback (PKCE ?code= flow). PKCE requires a verifier
// cookie set on the same browser that requested the link — admin-generated
// links never have one, so we use verifyOtp here instead.
// =============================================================================

const VALID_TYPES: ReadonlySet<EmailOtpType> = new Set([
  'magiclink',
  'recovery',
  'invite',
  'email',
  'email_change',
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/scan';

  if (!token_hash || !type || !VALID_TYPES.has(type)) {
    return NextResponse.redirect(
      `${origin}/login?error=missing_or_invalid_token`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
