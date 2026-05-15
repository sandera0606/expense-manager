'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { deleteTransactionAndReceipt } from './actions';

export function DeleteTransactionButton({
  id,
  hasReceipt,
}: {
  id: string;
  hasReceipt: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="destructive"
      disabled={pending}
      onClick={() => {
        const msg = hasReceipt
          ? 'Delete this transaction and its receipt file? This cannot be undone.'
          : 'Delete this transaction? This cannot be undone.';
        if (!window.confirm(msg)) return;
        start(() => deleteTransactionAndReceipt(id));
      }}
    >
      {pending ? 'Deleting…' : 'Delete transaction'}
    </Button>
  );
}
