'use client';

import { useActionState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  addCategory,
  deleteCategory,
  type CategoryActionState,
} from './actions';

const initial: CategoryActionState = { status: 'idle' };

export type CategoryRow = {
  id: string;
  name: string;
  created_at: string;
  usage_count: number;
};

export function CategoriesEditor({ categories }: { categories: CategoryRow[] }) {
  const [state, action, pending] = useActionState(addCategory, initial);
  const [isDeleting, startDelete] = useTransition();

  return (
    <div className="space-y-6">
      <form action={action} className="flex items-end gap-2">
        <label className="flex-1 space-y-1.5">
          <span className="text-sm font-medium">Add category</span>
          <input
            name="name"
            placeholder="e.g. Pet care"
            required
            maxLength={80}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </form>
      {state.status === 'error' && (
        <p className="-mt-4 text-sm text-destructive">{state.message}</p>
      )}

      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {categories.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No categories yet.
          </li>
        ) : (
          categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.usage_count} transaction{c.usage_count === 1 ? '' : 's'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={isDeleting}
                onClick={() => {
                  if (
                    !window.confirm(
                      c.usage_count > 0
                        ? `Delete "${c.name}"? ${c.usage_count} transaction${
                            c.usage_count === 1 ? '' : 's'
                          } will become uncategorized.`
                        : `Delete "${c.name}"?`
                    )
                  )
                    return;
                  startDelete(() => deleteCategory(c.id));
                }}
              >
                Delete
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
