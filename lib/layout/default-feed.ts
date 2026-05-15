import type { Layout } from '@/types/layout';

// =============================================================================
// Default Feed layout. Also seeded in lib/db/schema.sql (handle_new_user
// trigger), but kept here in TypeScript as a source-of-truth fallback if no
// persisted layout exists.
// =============================================================================

export const defaultFeedLayout: Layout = {
  id: 'default-feed',
  name: 'Feed',
  root: {
    kind: 'list',
    source: {
      sort: [{ field: 'occurred_at', dir: 'desc' }],
      limit: 100,
    },
    row: {
      kind: 'card',
      fields: [
        { field: 'occurred_at', format: 'date' },
        { field: 'merchant_normalized', label: 'Merchant' },
        { field: 'total_amount', format: 'currency' },
        { field: 'currency' },
      ],
    },
    empty: 'No transactions yet. Upload a receipt to get started.',
  },
};
