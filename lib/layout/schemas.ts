import { z } from 'zod';

import { TRANSACTION_FIELDS } from '@/types/canonical';
import type { Layout, LayoutNode } from '@/types/layout';

// =============================================================================
// Zod schema for Layout JSON. The renderer, the layouts.spec column, and
// future AI-generated layouts all validate against this. If you change the
// shape, update types/layout.ts in lockstep.
// =============================================================================

const transactionField = z.enum(TRANSACTION_FIELDS);

const filter = z.object({
  field: transactionField,
  op: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'contains']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

const sort = z.object({
  field: transactionField,
  dir: z.enum(['asc', 'desc']),
});

export const viewQuerySchema = z.object({
  filters: z.array(filter).optional(),
  group_by: transactionField.optional(),
  sort: z.array(sort).optional(),
  limit: z.number().int().positive().optional(),
});

const fieldFormat = z.enum(['currency', 'date', 'text', 'number']);
const cardField = z.object({
  field: transactionField,
  label: z.string().optional(),
  format: fieldFormat.optional(),
});

// LayoutNode is recursive — annotate the schema with the TS type from
// types/layout.ts so zod's inference doesn't try to expand the cycle itself.
export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('list'),
      source: viewQuerySchema,
      row: layoutNodeSchema,
      empty: z.string().optional(),
    }),
    z.object({
      kind: z.literal('group'),
      source: viewQuerySchema,
      group_by: transactionField,
      child: layoutNodeSchema,
    }),
    z.object({
      kind: z.literal('card'),
      fields: z.array(cardField),
    }),
    z.object({
      kind: z.literal('stack'),
      direction: z.enum(['row', 'col']),
      children: z.array(layoutNodeSchema),
      gap: z.number().optional(),
    }),
    z.object({
      kind: z.literal('text'),
      content: z.string(),
    }),
    z.object({
      kind: z.literal('metric'),
      source: viewQuerySchema,
      aggregation: z.enum(['sum', 'count', 'avg']),
      field: transactionField.optional(),
      label: z.string(),
    }),
  ])
);

export const layoutSchema: z.ZodType<Layout> = z.object({
  id: z.string(),
  name: z.string(),
  root: layoutNodeSchema,
});
