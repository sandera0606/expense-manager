// =============================================================================
// Layout JSON — the single source of truth for adaptive UI.
// Renderer, AI tools that generate views, and persisted layouts.spec all
// validate against the zod schema in lib/layout/schemas.ts which mirrors this.
// =============================================================================

import type { TransactionField } from './canonical';

export type FieldOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'in'
  | 'contains';

export type Filter = {
  field: TransactionField;
  op: FieldOp;
  value: string | number | boolean | Array<string | number>;
};

export type Sort = {
  field: TransactionField;
  dir: 'asc' | 'desc';
};

export type ViewQuery = {
  filters?: Filter[];
  group_by?: TransactionField;
  sort?: Sort[];
  limit?: number;
};

export type FieldFormat = 'currency' | 'date' | 'text' | 'number';

export type CardField = {
  field: TransactionField;
  label?: string;
  format?: FieldFormat;
};

export type LayoutNode =
  | {
      kind: 'list';
      source: ViewQuery;
      row: LayoutNode;
      empty?: string;
    }
  | {
      kind: 'group';
      source: ViewQuery;
      group_by: TransactionField;
      child: LayoutNode;
    }
  | {
      kind: 'card';
      fields: CardField[];
    }
  | {
      kind: 'stack';
      direction: 'row' | 'col';
      children: LayoutNode[];
      gap?: number;
    }
  | {
      kind: 'text';
      content: string;
    }
  | {
      kind: 'metric';
      source: ViewQuery;
      aggregation: 'sum' | 'count' | 'avg';
      field?: TransactionField;
      label: string;
    };

export type Layout = {
  id: string;
  name: string;
  root: LayoutNode;
};
