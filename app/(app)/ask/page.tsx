import { Suspense } from 'react';

import { LayoutRenderer } from '@/components/layout-renderer';
import { answerQuery } from '@/lib/ai/answer-query';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { viewQuerySchema } from '@/lib/layout/schemas';
import type { LayoutNode, ViewQuery } from '@/types/layout';

import { saveAsView, submitQuestion } from './actions';

// =============================================================================
// /ask — type a question, get a list back. The AI returns a ViewQuery; the
// result renders through the same LayoutRenderer the feed uses. No AI-
// generated frontend code crosses the wire — only structured query JSON.
//
// URL contract:
//   /ask                  → empty form
//   /ask?q=<question>     → run NL → ViewQuery, render
//   /ask?view=<uuid>      → load a saved view by id, render (no AI call)
// =============================================================================

export default function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
        <p className="text-sm text-muted-foreground">
          Ask a question about your transactions. Claude returns a structured
          query, the same renderer draws the result.
        </p>
      </header>

      <Suspense fallback={null}>
        <AskForm searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AskForm({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <form action={submitQuestion} className="flex gap-2">
      <input
        name="q"
        defaultValue={q ?? ''}
        placeholder="e.g. coffee spending this month"
        className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        autoFocus
      />
      <button
        type="submit"
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
      >
        Ask
      </button>
    </form>
  );
}

async function Results({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const session = await verifySession();
  const { q, view } = await searchParams;

  if (!q && !view) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
        Try “last month’s spending”, “coffee under $10”, or “anything over
        $200”.
      </p>
    );
  }

  const supabase = await createClient();

  let viewQuery: ViewQuery | null = null;
  let summary: string;
  let savedViewName: string | null = null;

  if (view) {
    const { data: row } = await supabase
      .from('views')
      .select('id, name, query')
      .eq('id', view)
      .maybeSingle();
    if (!row) {
      return (
        <p className="text-sm text-destructive">Saved view not found.</p>
      );
    }
    const parsed = viewQuerySchema.safeParse(row.query);
    if (!parsed.success) {
      return (
        <p className="text-sm text-destructive">
          Stored view JSON is invalid: {parsed.error.message}
        </p>
      );
    }
    viewQuery = parsed.data;
    savedViewName = row.name;
    summary = `Saved view: ${row.name}`;
  } else {
    const result = await answerQuery({
      supabase,
      userId: session.userId,
      question: q!,
    });
    if (!result.ok) {
      return (
        <p className="text-sm text-destructive">
          Couldn’t translate that question: {result.error}
        </p>
      );
    }
    viewQuery = result.query;
    summary = result.summary;
  }

  const layoutRoot: LayoutNode = {
    kind: 'list',
    source: viewQuery,
    empty: 'No transactions match that query.',
    row: {
      kind: 'card',
      fields: [
        { field: 'occurred_at', format: 'date' },
        { field: 'merchant_normalized', label: 'Merchant' },
        { field: 'total_amount', format: 'currency' },
        { field: 'currency' },
      ],
    },
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card px-4 py-3 text-sm">
        <p className="text-muted-foreground">{summary}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Query JSON
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(viewQuery, null, 2)}
          </pre>
        </details>
      </div>

      {!savedViewName && (
        <form action={saveAsView} className="flex gap-2">
          <input type="hidden" name="query" value={JSON.stringify(viewQuery)} />
          <input
            name="name"
            placeholder="Save as view (e.g. Coffee runs)"
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Save view
          </button>
        </form>
      )}

      <LayoutRenderer node={layoutRoot} supabase={supabase} />
    </div>
  );
}

function ResultsSkeleton() {
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
