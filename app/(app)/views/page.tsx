import Link from 'next/link';
import { Suspense } from 'react';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

import { deleteView } from './actions';

// =============================================================================
// /views — saved ViewQuery rows. Click one → /ask?view=<id> renders it with
// the LayoutRenderer (no AI call needed). Phase-1 management: name + delete.
// =============================================================================

export default function ViewsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Views</h1>
        <Link href="/ask" className="text-sm underline">
          New view via Ask →
        </Link>
      </header>
      <Suspense fallback={<ViewsSkeleton />}>
        <ViewsList />
      </Suspense>
    </div>
  );
}

async function ViewsList() {
  const session = await verifySession();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('views')
    .select('id, name, query, created_at')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false });

  if (!rows || rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
        No saved views yet. Go to <Link href="/ask" className="underline">Ask</Link>, run a query, then “Save view”.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {rows.map((v) => (
        <li key={v.id} className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <Link
              href={`/ask?view=${v.id}`}
              className="text-sm font-medium hover:underline"
            >
              {v.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {new Date(v.created_at).toLocaleDateString()}
            </p>
          </div>
          <form action={deleteView}>
            <input type="hidden" name="id" value={v.id} />
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Delete
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function ViewsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-md border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}
