import { Suspense } from 'react';

import { verifySession } from '@/lib/auth/dal';
import { CameraClient } from './camera-client';

// Mobile-first burst capture page. Renders a fullscreen viewfinder; users
// snap receipts one after another while uploads run in parallel in the
// background. Reuses the existing /upload ingestion pipeline.

export const metadata = {
  title: 'Scan',
};

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <ScanShell />
    </Suspense>
  );
}

async function ScanShell() {
  // Gate the route on a real session — same pattern as the rest of (app).
  // verifySession() reads cookies, which is an uncached request-time API,
  // so it must sit inside a Suspense boundary per Cache Components rules.
  await verifySession();
  return <CameraClient />;
}
