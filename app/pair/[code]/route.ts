import { NextResponse, type NextRequest } from 'next/server';

import { consumePairingCode } from '@/lib/auth/pairing';
import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================================
// QR pairing endpoint.
//
// The desktop generates a one-time code, shows it as a QR. The phone scans
// and lands here. We trade the code for a Supabase magic-link token (via
// the admin API), then bounce the phone to /auth/confirm which calls
// verifyOtp server-side and writes session cookies on the phone's browser.
//
// Public route on purpose — the phone is unauthenticated at this point;
// that's exactly what the pairing handshake is solving.
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const origin = new URL(request.url).origin;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = request.headers.get('user-agent') ?? null;

  const consumed = await consumePairingCode(code, { ip, ua });
  if (!consumed.ok) {
    return NextResponse.redirect(`${origin}/login?reason=pair_failed`);
  }

  const admin = createAdminClient();

  // Need the user's email to ask Supabase for a magic-link token.
  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(
    consumed.userId
  );
  if (userErr || !userRes.user?.email) {
    return NextResponse.redirect(`${origin}/login?reason=pair_no_user`);
  }

  // Ask Supabase for the magic-link token. We don't redirect through
  // /auth/v1/verify — instead we extract `hashed_token` and hand it to
  // our own /auth/confirm, which calls verifyOtp server-side. That sidesteps
  // PKCE entirely (no verifier cookie on the phone) and means we don't have
  // to maintain a Supabase redirect-URL allow-list per tunnel host.
  const { data: linkRes, error: linkErr } = await admin.auth.admin.generateLink(
    {
      type: 'magiclink',
      email: userRes.user.email,
    }
  );
  if (linkErr || !linkRes.properties?.hashed_token) {
    return NextResponse.redirect(`${origin}/login?reason=pair_link_failed`);
  }

  const confirm = new URL(`${origin}/auth/confirm`);
  confirm.searchParams.set('token_hash', linkRes.properties.hashed_token);
  confirm.searchParams.set('type', 'magiclink');
  confirm.searchParams.set('next', '/scan');

  return NextResponse.redirect(confirm.toString());
}
