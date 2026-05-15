import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

import { DeleteTransactionButton } from './delete-button';
import { TransactionForm } from './form';

export default function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Transaction</h1>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/40" />}>
        <TransactionBody params={params} />
      </Suspense>
    </div>
  );
}

async function TransactionBody({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifySession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: txn } = await supabase
    .from('transactions')
    .select(
      'id, occurred_at, merchant, merchant_normalized, total_amount, currency, payment_method, category_id, notes, confidence, receipt_id'
    )
    .eq('id', id)
    .maybeSingle();
  if (!txn) notFound();

  const { data: lineItems } = await supabase
    .from('transaction_line_items')
    .select('description, quantity, unit_price, total, position')
    .eq('transaction_id', id)
    .order('position');

  const itemsSum =
    (lineItems ?? []).reduce((acc, li) => acc + Number(li.total), 0) || 0;
  const total = Number(txn.total_amount);
  const gap = total - itemsSum;
  const showDiscrepancy =
    (lineItems?.length ?? 0) > 0 && Math.abs(gap) > 0.01;

  return (
    <>
      {txn.receipt_id && (
        <a
          href={`/receipts/${txn.receipt_id}`}
          className="text-xs text-muted-foreground underline"
        >
          View source receipt →
        </a>
      )}

      <TransactionForm
        id={txn.id}
        initial={{
          merchant: txn.merchant ?? '',
          total_amount: String(txn.total_amount),
          currency: txn.currency,
          occurred_at: txn.occurred_at.slice(0, 16),
          notes: txn.notes ?? '',
        }}
      />

      {lineItems && lineItems.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Line items</h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {lineItems.map((li) => (
              <li
                key={li.position}
                className="flex justify-between px-3 py-2 text-sm"
              >
                <span>{li.description}</span>
                <span className="font-mono">
                  {li.quantity ? `${li.quantity} × ` : ''}
                  {li.total}
                </span>
              </li>
            ))}
          </ul>
          {showDiscrepancy && (
            <p className="mt-2 text-xs text-muted-foreground">
              Items sum to{' '}
              <span className="font-mono">{itemsSum.toFixed(2)}</span> —{' '}
              <span className="font-mono">
                {gap >= 0 ? '+' : ''}
                {gap.toFixed(2)} {txn.currency}
              </span>{' '}
              unaccounted (tax · tip · fees · discounts).
            </p>
          )}
        </section>
      )}

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="mb-2 text-sm font-medium text-destructive">Danger zone</h2>
        <DeleteTransactionButton
          id={txn.id}
          hasReceipt={Boolean(txn.receipt_id)}
        />
      </section>
    </>
  );
}
