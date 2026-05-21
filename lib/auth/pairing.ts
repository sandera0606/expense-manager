import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================================
// Pairing codes — short-lived single-use tokens that let an already-authed
// desktop hand a fresh Supabase session to a phone, without the phone
// touching email auth at all.
//
// Flow:
//   1. Desktop calls generatePairingCode() → row inserted, code returned.
//   2. Desktop renders /pair/<code> as a QR.
//   3. Phone scans → GETs /pair/<code> → calls consumePairingCode() →
//      gets userId → admin.generateLink → redirects to /auth/confirm with
//      the magic-link token_hash → /auth/confirm calls verifyOtp →
//      session cookies set on phone.
// =============================================================================

const CODE_LENGTH = 10;
// Crockford base32 alphabet: 32 characters, no I/L/O/U to dodge mis-typing
// (the code only travels via QR but easier-to-read codes are friendlier for
// the inevitable fallback of "just type the code in").
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TTL_MS = 5 * 60 * 1000;

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false };

export async function generatePairingCode(
  userId: string
): Promise<{ code: string; expiresAt: Date }> {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const admin = createAdminClient();
  const { error } = await admin.from('pairing_codes').insert({
    code,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`pairing_codes insert failed: ${error.message}`);
  return { code, expiresAt };
}

export async function consumePairingCode(
  code: string,
  meta?: { ip?: string | null; ua?: string | null }
): Promise<ConsumeResult> {
  const admin = createAdminClient();
  // One SQL statement: update + filter + returning. Postgres evaluates the
  // WHERE atomically with the UPDATE, so two phones racing on the same code
  // can't both succeed.
  const { data, error } = await admin
    .from('pairing_codes')
    .update({
      consumed_at: new Date().toISOString(),
      consumer_ip: meta?.ip ?? null,
      consumer_ua: meta?.ua ?? null,
    })
    .eq('code', code)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id')
    .maybeSingle();
  if (error || !data) return { ok: false };
  return { ok: true, userId: data.user_id };
}

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Alphabet is exactly 32 chars → 5 bits per char → mask is bias-free.
    out += CODE_ALPHABET[bytes[i] & 31];
  }
  return out;
}
