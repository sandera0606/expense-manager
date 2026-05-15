import { Suspense } from 'react';

import { LayoutRenderer } from '@/components/layout-renderer';
import { verifySession } from '@/lib/auth/dal';
import { defaultFeedLayout } from '@/lib/layout/default-feed';
import { layoutSchema } from '@/lib/layout/schemas';
import { createClient } from '@/lib/supabase/server';
import type { Layout } from '@/types/layout';

export default function FeedPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
      </header>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedBody />
      </Suspense>
    </div>
  );
}

async function FeedBody() {
  await verifySession();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from('layouts')
    .select('spec')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  const layout: Layout = row?.spec
    ? layoutSchema.parse(row.spec)
    : defaultFeedLayout;

  return <LayoutRenderer node={layout.root} supabase={supabase} />;
}

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-md border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}
