'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  generatePairingQR,
  type PairingPayload,
} from '@/app/(app)/upload/pair-actions';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: PairingPayload }
  | { kind: 'error'; message: string };

export function PairPanel() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());

  function regenerate() {
    setState({ kind: 'loading' });
    fetchCode().then(setState);
  }

  // Mint a code on first mount. The effect only kicks off the async fetch;
  // it never calls setState synchronously so we don't trip React Compiler's
  // cascading-renders rule.
  useEffect(() => {
    let cancelled = false;
    fetchCode().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick once a second so the countdown re-renders.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.kind]);

  const expiresAt =
    state.kind === 'ready' ? new Date(state.payload.expiresAt).getTime() : 0;
  const secondsLeft =
    state.kind === 'ready' ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const expired = state.kind === 'ready' && secondsLeft === 0;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Send to phone</h2>
        <p className="text-sm text-muted-foreground">
          Scan this code with your phone&rsquo;s camera. It opens a camera page
          on your phone, already signed in — no email required.
        </p>
      </header>

      <div className="mt-4 flex flex-col items-center gap-3">
        {state.kind === 'loading' ? (
          <div className="flex h-[280px] w-[280px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            Generating…
          </div>
        ) : state.kind === 'error' ? (
          <div className="flex h-[280px] w-[280px] items-center justify-center rounded-md border border-destructive bg-destructive/5 px-4 text-center text-xs text-destructive">
            {state.message}
          </div>
        ) : (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.payload.qrDataUrl}
              alt="Pairing QR code"
              width={280}
              height={280}
              className={expired ? 'opacity-30' : ''}
            />
            {expired && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70 text-sm font-medium">
                Expired
              </div>
            )}
          </div>
        )}

        {state.kind === 'ready' && !expired && (
          <p className="text-xs text-muted-foreground">
            Expires in {formatTime(secondsLeft)}
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={regenerate}
          disabled={state.kind === 'loading'}
        >
          {expired ? 'Generate new code' : 'Regenerate'}
        </Button>
      </div>
    </section>
  );
}

async function fetchCode(): Promise<State> {
  try {
    const payload = await generatePairingQR();
    return { kind: 'ready', payload };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate code';
    return { kind: 'error', message };
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
