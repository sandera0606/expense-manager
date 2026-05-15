// =============================================================================
// Zod schemas for AI-extracted receipt data. Single source of truth for:
//   - VLM tool-use input_schema (converted via zodToJsonSchema or hand-mirror)
//   - validation of LLM output before persistence
//   - TypeScript types in types/ai.ts (via z.infer)
// =============================================================================

import { z } from 'zod';

import { viewQuerySchema } from '@/lib/layout/schemas';

export const answerQueryOutputSchema = z.object({
  query: viewQuerySchema,
  summary: z.string().min(1),
});

export const extractedLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total: z.number(),
  // Per-line category hint. Only set when the line clearly belongs to a
  // different category than the transaction as a whole (e.g. a coffee in
  // the middle of a grocery run). Null means "use the transaction's
  // category".
  category_hint: z.string().nullable().optional(),
});

export const extractedReceiptSchema = z.object({
  // ISO-8601 date or datetime. The extractor may return date-only when no time
  // is printed; the normalizer fills time as 00:00 local.
  occurred_at: z.string().min(1),
  merchant: z.string().nullable(),
  total_amount: z.number(),
  currency: z.string().length(3).default('USD'),
  payment_method: z.string().nullable().optional(),
  line_items: z.array(extractedLineItemSchema).default([]),
  // Suggested category name from a small fixed taxonomy; the normalizer maps
  // this to a category_id, creating a new category if unmatched.
  category_hint: z.string().nullable().optional(),
  // Free-form notes the model wants to surface (e.g. "split bill", "tip $5").
  notes: z.string().nullable().optional(),
  // Model self-assessed extraction confidence, 0..1. Below threshold ⇒
  // receipt status becomes 'needs_review'.
  confidence: z.number().min(0).max(1),
});

// JSON Schema representation for Claude tool-use input_schema. We mirror by
// hand rather than pulling zod-to-json-schema because Anthropic's tool schema
// has a slightly different shape and we want explicit control.
export const extractedReceiptToolSchema = {
  type: 'object',
  properties: {
    occurred_at: {
      type: 'string',
      description:
        'ISO-8601 date or datetime of the transaction as printed on the receipt. Use date-only (YYYY-MM-DD) when no time is shown.',
    },
    merchant: {
      type: ['string', 'null'],
      description: 'Merchant name exactly as it appears on the receipt.',
    },
    total_amount: {
      type: 'number',
      description:
        'Final total paid, including tax and tip. Always the grand total, never a subtotal.',
    },
    currency: {
      type: 'string',
      description:
        'ISO 4217 currency code. Default to USD if no currency symbol is present.',
    },
    payment_method: {
      type: ['string', 'null'],
      description:
        'Payment method if visible (e.g. "Visa ****1234", "Cash", "Apple Pay"). Null if not shown.',
    },
    line_items: {
      type: 'array',
      description:
        'Individual purchased items. Empty array if the receipt does not show itemized lines.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          total: { type: 'number' },
          category_hint: {
            type: ['string', 'null'],
            description:
              'Per-line category hint, only when this line clearly belongs to a different category than the receipt as a whole. Otherwise null (uses the transaction category). Same enum as the top-level category_hint.',
          },
        },
        required: ['description', 'total'],
      },
    },
    category_hint: {
      type: ['string', 'null'],
      description:
        'Best guess at one of: Food & Drink, Groceries, Transport, Housing, Utilities, Health, Entertainment, Shopping, Travel, Subscriptions, Income, Other. Null if uncertain.',
    },
    notes: {
      type: ['string', 'null'],
      description:
        'Anything worth surfacing that does not fit other fields (e.g. tip amount, split bill, refund). Null if none.',
    },
    confidence: {
      type: 'number',
      description:
        'Your overall confidence the extraction is correct, 0.0 (low) to 1.0 (high). Be calibrated: 0.5 means roughly half the fields might be wrong.',
    },
  },
  required: ['occurred_at', 'total_amount', 'currency', 'confidence', 'line_items', 'merchant'],
} as const;
