'use server';

import { headers } from 'next/headers';
import QRCode from 'qrcode';

import { verifySession } from '@/lib/auth/dal';
import { generatePairingCode } from '@/lib/auth/pairing';

export type PairingPayload = {
  url: string;
  qrDataUrl: string;
  expiresAt: string;
};

export async function generatePairingQR(): Promise<PairingPayload> {
  const session = await verifySession();
  const { code, expiresAt } = await generatePairingCode(session.userId);

  // Resolution order:
  //  1. NEXT_PUBLIC_APP_URL — explicit override for dev tunnels. If set,
  //     it wins regardless of where the desktop is browsing from. This is
  //     the path you need when /upload is open on localhost but the QR has
  //     to point at the cloudflared/ngrok URL the phone can actually reach.
  //  2. Origin header — works in production where desktop and phone use
  //     the same public URL.
  //  3. Host header — last-ditch fallback.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    h.get('origin') ??
    `https://${h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'}`;

  const url = `${origin}/pair/${code}`;
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 280,
    margin: 1,
    color: { dark: '#3A2F18', light: '#FBF7EE' },
  });

  return { url, qrDataUrl, expiresAt: expiresAt.toISOString() };
}
