import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Filter, ViewQuery } from '@/types/layout';
import type { Transaction } from '@/types/canonical';

// =============================================================================
// The ONLY place that translates a ViewQuery into a Supabase query. If you
// add new operators or aggregations, do it here — no SQL leaks elsewhere.
// =============================================================================

export type ListResult = Pick<
  Transaction,
  | 'id'
  | 'occurred_at'
  | 'merchant'
  | 'merchant_normalized'
  | 'total_amount'
  | 'currency'
  | 'payment_method'
  | 'category_id'
  | 'notes'
  | 'confidence'
>;

const PROJECTED_FIELDS =
  'id, occurred_at, merchant, merchant_normalized, total_amount, currency, payment_method, category_id, notes, confidence';

export async function runListQuery(
  supabase: SupabaseClient,
  query: ViewQuery
): Promise<ListResult[]> {
  // PostgREST builder is mutable; build it up.
  let q = supabase.from('transactions').select(PROJECTED_FIELDS);

  for (const f of query.filters ?? []) {
    q = applyFilter(q, f);
  }
  for (const s of query.sort ?? []) {
    q = q.order(s.field, { ascending: s.dir === 'asc' });
  }
  if (typeof query.limit === 'number') {
    q = q.limit(query.limit);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`runListQuery failed: ${error.message}`);
  }
  return (data ?? []) as ListResult[];
}

export async function runMetric(
  supabase: SupabaseClient,
  query: ViewQuery,
  aggregation: 'sum' | 'count' | 'avg',
  field?: string
): Promise<number> {
  // For MVP, compute aggregations client-side over a bounded fetch. Real
  // aggregation pushdown can come later via a `rpc` to a SQL function.
  const rows = await runListQuery(supabase, query);
  if (aggregation === 'count') return rows.length;
  if (!field) return 0;
  const values = rows
    .map((r) => (r as unknown as Record<string, unknown>)[field])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return 0;
  if (aggregation === 'sum') return values.reduce((a, b) => a + b, 0);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// PostgREST builder is generic-typed; the operator dispatch is straightforward
// at runtime but awkward to express in TS without an `any`. Scope the `any` to
// this helper.
function applyFilter<T>(q: T, f: Filter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = q as any;
  switch (f.op) {
    case 'eq':
      return b.eq(f.field, f.value);
    case 'neq':
      return b.neq(f.field, f.value);
    case 'gt':
      return b.gt(f.field, f.value);
    case 'lt':
      return b.lt(f.field, f.value);
    case 'gte':
      return b.gte(f.field, f.value);
    case 'lte':
      return b.lte(f.field, f.value);
    case 'in':
      return b.in(f.field, Array.isArray(f.value) ? f.value : [f.value]);
    case 'contains':
      return b.ilike(f.field, `%${String(f.value)}%`);
  }
}
