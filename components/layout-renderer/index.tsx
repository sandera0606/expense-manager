import 'server-only';

import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';

import { runListQuery, runMetric, type ListResult } from '@/lib/layout/query';
import type { LayoutNode } from '@/types/layout';

import { formatField } from './format';

// =============================================================================
// LayoutRenderer — the only React code that knows how to turn a LayoutNode
// tree into UI. Runs as a Server Component; each node that needs data awaits
// its ViewQuery inline. Future: stream nodes via <Suspense> per node.
// =============================================================================

type RowContext = ListResult;

export async function LayoutRenderer({
  node,
  supabase,
}: {
  node: LayoutNode;
  supabase: SupabaseClient;
}) {
  return renderNode(node, supabase, null);
}

async function renderNode(
  node: LayoutNode,
  supabase: SupabaseClient,
  row: RowContext | null
): Promise<React.ReactNode> {
  switch (node.kind) {
    case 'list': {
      const rows = await runListQuery(supabase, node.source);
      if (rows.length === 0) {
        return (
          <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            {node.empty ?? 'Nothing here yet.'}
          </p>
        );
      }
      return (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {await Promise.all(
            rows.map(async (r) => (
              <li key={r.id} className="hover:bg-muted/40">
                <Link
                  href={`/transactions/${r.id}`}
                  className="block px-4 py-3"
                >
                  {await renderNode(node.row, supabase, r)}
                </Link>
              </li>
            ))
          )}
        </ul>
      );
    }

    case 'card': {
      if (!row) {
        return (
          <p className="text-sm text-destructive">
            card node rendered outside a list / group context
          </p>
        );
      }
      return (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {node.fields.map((f) => {
            const value = (row as unknown as Record<string, unknown>)[f.field];
            return (
              <div key={f.field} className="text-sm">
                {f.label && (
                  <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </span>
                )}
                <span className="font-medium">{formatField(value, f.format)}</span>
              </div>
            );
          })}
        </div>
      );
    }

    case 'stack': {
      const className =
        node.direction === 'row'
          ? `flex flex-row gap-${node.gap ?? 3}`
          : `flex flex-col gap-${node.gap ?? 3}`;
      return (
        <div className={className}>
          {await Promise.all(
            node.children.map((c, i) => (
              <RenderedChild key={i} node={c} supabase={supabase} row={row} />
            ))
          )}
        </div>
      );
    }

    case 'text':
      return <p className="text-sm text-muted-foreground">{node.content}</p>;

    case 'metric': {
      const value = await runMetric(
        supabase,
        node.source,
        node.aggregation,
        node.field
      );
      return (
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {node.label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      );
    }

    case 'group': {
      // Phase 2: full group-by semantics. For MVP, fall back to a flat list.
      const rows = await runListQuery(supabase, node.source);
      const groups = new Map<string, ListResult[]>();
      for (const r of rows) {
        const key = String(
          (r as unknown as Record<string, unknown>)[node.group_by] ?? '—'
        );
        const bucket = groups.get(key) ?? [];
        bucket.push(r);
        groups.set(key, bucket);
      }
      return (
        <div className="space-y-6">
          {await Promise.all(
            Array.from(groups.entries()).map(async ([key, bucket]) => (
              <section key={key}>
                <h3 className="mb-2 text-sm font-semibold">{key}</h3>
                <ul className="divide-y divide-border rounded-md border border-border bg-card">
                  {await Promise.all(
                    bucket.map(async (r) => (
                      <li key={r.id} className="px-4 py-3">
                        {await renderNode(node.child, supabase, r)}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            ))
          )}
        </div>
      );
    }
  }
}

async function RenderedChild({
  node,
  supabase,
  row,
}: {
  node: LayoutNode;
  supabase: SupabaseClient;
  row: RowContext | null;
}) {
  return renderNode(node, supabase, row);
}
