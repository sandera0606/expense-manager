import { Suspense } from 'react';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

import { CategoriesEditor } from './editor';

export default function CategoriesSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          The taxonomy your transactions get sorted into. New ones can also be
          created automatically when the extractor sees a confident new hint.
        </p>
      </header>
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-md bg-muted/40" />
        }
      >
        <Categories />
      </Suspense>
    </div>
  );
}

async function Categories() {
  await verifySession();
  const supabase = await createClient();

  // Fetch categories + usage count in a single round trip.
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, created_at, transactions(count)')
    .order('name');

  const rows = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    usage_count:
      Array.isArray(c.transactions) && c.transactions[0]
        ? Number((c.transactions[0] as { count: number }).count)
        : 0,
  }));

  return <CategoriesEditor categories={rows} />;
}
