'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { updateTransaction, type UpdateState } from './actions';

const initial: UpdateState = { status: 'idle' };

export function TransactionForm({
  id,
  initial: initialValues,
}: {
  id: string;
  initial: {
    merchant: string;
    total_amount: string;
    currency: string;
    occurred_at: string;
    notes: string;
  };
}) {
  const [state, action, pending] = useActionState(
    updateTransaction.bind(null, id),
    initial
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Merchant" name="merchant" defaultValue={initialValues.merchant} />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Total"
          name="total_amount"
          type="number"
          step="0.01"
          defaultValue={initialValues.total_amount}
        />
        <Field
          label="Currency"
          name="currency"
          maxLength={3}
          defaultValue={initialValues.currency}
        />
      </div>
      <Field
        label="Date"
        name="occurred_at"
        type="datetime-local"
        defaultValue={initialValues.occurred_at}
      />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Notes</span>
        <textarea
          name="notes"
          defaultValue={initialValues.notes}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center justify-between">
        <p
          className={
            'text-xs ' +
            (state.status === 'error'
              ? 'text-destructive'
              : state.status === 'saved'
                ? 'text-emerald-600'
                : 'text-muted-foreground')
          }
        >
          {state.status === 'error' && state.message}
          {state.status === 'saved' && 'Saved.'}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        {...rest}
      />
    </label>
  );
}
