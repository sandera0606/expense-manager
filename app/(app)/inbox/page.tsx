import Link from 'next/link';
import { Suspense } from 'react';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// /inbox — receipts that need human attention. Mobile-first: each row is a
// tap target that opens the receipt detail page. Surfaces:
//   needs_review  — extracted but confidence below threshold
//   failed        — extraction errored
//   extracting    — still in flight (shouldn't linger; useful for debugging)
// =============================================================================

const INBOX_STATUSES = ['needs_review', 'failed', 'extracting'] as const;

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <Link href="/upload" className="text-sm underline">
          + Upload
        </Link>
      </header>
      <Suspense fallback={<InboxSkeleton />}>
        <InboxList />
      </Suspense>
    </div>
  );
}

async function InboxList() {
  await verifySession();
  const supabase = await createClient();

  const { data: receipts } = await supabase
    .from('receipts')
    .select(
      `id, status, mime_type, created_at,
       transactions:transactions ( id, merchant, merchant_normalized, total_amount, currency, confidence )`
    )
    .in('status', INBOX_STATUSES)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!receipts || receipts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
        Nothing waiting for review.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {receipts.map((r) => {
        const txn = Array.isArray(r.transactions)
          ? r.transactions[0]
          : r.transactions;
        return (
          <li key={r.id}>
            <Link
              href={`/receipts/${r.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {txn?.merchant ?? '(unknown merchant)'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {txn && (
                  <span className="font-mono text-sm">
                    {Number(txn.total_amount).toFixed(2)} {txn.currency}
                  </span>
                )}
                <StatusPill
                  status={r.status}
                  confidence={txn?.confidence ?? null}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function StatusPill({
  status,
  confidence,
}: {
  status: string;
  confidence: number | null;
}) {
  if (status === 'needs_review') {
    const pct = confidence !== null ? Math.round(Number(confidence) * 100) : null;
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Review{pct !== null ? ` · ${pct}%` : ''}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
        Failed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {status}
    </span>
  );
}

function InboxSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-md border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}
