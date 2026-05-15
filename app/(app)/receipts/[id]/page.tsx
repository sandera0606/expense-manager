import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

import { DeleteReceiptLink } from './delete-link';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  extracting: 'Extracting…',
  extracted: 'Extracted',
  needs_review: 'Needs review',
  failed: 'Failed',
};

export default function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup?: string }>;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Suspense fallback={<ReceiptSkeleton />}>
        <ReceiptBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReceiptBody({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup?: string }>;
}) {
  await verifySession();
  const { id } = await params;
  const { dup } = await searchParams;
  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from('receipts')
    .select('id, storage_path, mime_type, source_kind, status, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!receipt) notFound();

  const [{ data: signed }, { data: txn }, { data: runs }] = await Promise.all([
    supabase.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 60 * 10),
    supabase
      .from('transactions')
      .select(
        'id, occurred_at, merchant, merchant_normalized, total_amount, currency, confidence'
      )
      .eq('receipt_id', id)
      .maybeSingle(),
    supabase
      .from('extraction_runs')
      .select(
        'id, provider, model, prompt_version, parsed_output, error, input_tokens, output_tokens, latency_ms, cost_usd, created_at'
      )
      .eq('receipt_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const isImage = receipt.mime_type.startsWith('image/');

  // Near-duplicate detection. If we have a linked transaction with merchant
  // and total, look for any other transaction of the user with the same
  // merchant_normalized + total_amount within ±24h (different transaction).
  const nearDuplicates = txn
    ? await findNearDuplicates(supabase, txn)
    : [];

  return (
    <>
      {dup === 'exact' && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            You&rsquo;ve already uploaded this exact file.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Showing the original receipt rather than creating a duplicate.
          </p>
        </div>
      )}

      {nearDuplicates.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Possible duplicate transaction
            {nearDuplicates.length > 1 ? 's' : ''}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Same merchant and total around the same time:
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {nearDuplicates.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/transactions/${d.id}`}
                  className="underline hover:text-foreground"
                >
                  {d.merchant ?? 'unknown merchant'} · {d.total_amount}{' '}
                  {d.currency} · {new Date(d.occurred_at).toLocaleString()}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receipt</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(receipt.created_at).toLocaleString()} · {receipt.source_kind}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={receipt.status} />
          <DeleteReceiptLink id={receipt.id} />
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">File</h2>
          {signed?.signedUrl ? (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signed.signedUrl}
                alt="Receipt"
                className="w-full rounded-md border border-border"
              />
            ) : (
              <a
                href={signed.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-border bg-card p-6 text-center text-sm"
              >
                Open file ({receipt.mime_type})
              </a>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t generate a signed URL.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-medium">Transaction</h2>
            {txn ? (
              <div className="mt-2 space-y-1 rounded-md border border-border bg-card p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>{new Date(txn.occurred_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Merchant</span>
                  <span>{txn.merchant ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-mono">
                    {txn.total_amount} {txn.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <span>
                    {txn.confidence !== null
                      ? `${(Number(txn.confidence) * 100).toFixed(0)}%`
                      : '—'}
                  </span>
                </div>
                <div className="pt-2">
                  <Link
                    href={`/transactions/${txn.id}`}
                    className="text-sm underline"
                  >
                    Edit transaction →
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No transaction recorded.
                {receipt.status === 'failed' &&
                  ' Extraction failed — see audit trail below.'}
              </p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium">Extraction audit</h2>
            <ul className="mt-2 space-y-2">
              {(runs ?? []).map((run) => (
                <li
                  key={run.id}
                  className="rounded-md border border-border bg-card p-3 text-xs"
                >
                  <div className="flex justify-between font-mono">
                    <span>
                      {run.provider} · {run.model} · {run.prompt_version}
                    </span>
                    <span className="text-muted-foreground">
                      {run.latency_ms}ms
                      {run.cost_usd ? ` · $${Number(run.cost_usd).toFixed(4)}` : ''}
                    </span>
                  </div>
                  {run.error && (
                    <p className="mt-1 text-destructive">{run.error}</p>
                  )}
                  {run.parsed_output && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-muted-foreground">
                        Parsed JSON
                      </summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(run.parsed_output, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'extracted'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : status === 'needs_review'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : status === 'failed'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Look for transactions with the same merchant_normalized + total_amount that
// occurred within ±24h of this one, excluding the current transaction. RLS
// scopes the query to the current user automatically.
// -----------------------------------------------------------------------------
async function findNearDuplicates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  txn: {
    id: string;
    occurred_at: string;
    merchant_normalized: string | null;
    total_amount: number | string;
    currency: string;
  }
): Promise<
  Array<{
    id: string;
    occurred_at: string;
    merchant: string | null;
    total_amount: number;
    currency: string;
  }>
> {
  if (!txn.merchant_normalized) return [];
  const at = new Date(txn.occurred_at).getTime();
  const lo = new Date(at - 24 * 60 * 60 * 1000).toISOString();
  const hi = new Date(at + 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('transactions')
    .select('id, occurred_at, merchant, total_amount, currency')
    .neq('id', txn.id)
    .eq('merchant_normalized', txn.merchant_normalized)
    .eq('total_amount', txn.total_amount)
    .gte('occurred_at', lo)
    .lte('occurred_at', hi)
    .limit(5);
  return data ?? [];
}

function ReceiptSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-32 animate-pulse rounded bg-muted/40" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-md bg-muted/40" />
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-md bg-muted/40" />
          <div className="h-32 animate-pulse rounded-md bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
