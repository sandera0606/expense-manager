// =============================================================================
// AI output types — what the VLM extractor returns before normalization.
// The zod schema in lib/ai/schemas.ts is the source of truth; these are
// derived TypeScript types for ergonomic use in feature code.
// =============================================================================

import type { z } from 'zod';
import type {
  extractedLineItemSchema,
  extractedReceiptSchema,
} from '@/lib/ai/schemas';

export type ExtractedLineItem = z.infer<typeof extractedLineItemSchema>;
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;

export type ExtractionResult =
  | { ok: true; data: ExtractedReceipt; runId: string }
  | { ok: false; error: string; runId: string };

export type ExtractionTelemetry = {
  provider: 'anthropic' | 'openai';
  model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  cost_usd: number | null;
};
