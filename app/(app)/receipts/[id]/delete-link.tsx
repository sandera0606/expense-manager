'use client';

import { useTransition } from 'react';

import { deleteReceiptOnly } from './actions';

export function DeleteReceiptLink({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            'Remove the receipt file? The transaction will remain but lose its source. This cannot be undone.'
          )
        )
          return;
        start(() => deleteReceiptOnly(id));
      }}
      className="text-xs text-muted-foreground underline disabled:opacity-50 hover:text-destructive"
    >
      {pending ? 'Removing…' : 'Remove receipt only'}
    </button>
  );
}
