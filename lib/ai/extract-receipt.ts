import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { extractReceiptWithAnthropic } from '@/lib/ai/providers/anthropic';
import type { ExtractedReceipt, ExtractionResult } from '@/types/ai';

// =============================================================================
// extractReceipt — image bytes → ExtractedReceipt, with an extraction_runs
// row persisted in all cases (success or failure). This is the audit trail
// and the future eval dataset; never skip writing the run.
// =============================================================================

export async function extractReceipt(opts: {
  supabase: SupabaseClient;
  receiptId: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ExtractionResult> {
  const provider = await extractReceiptWithAnthropic({
    bytes: opts.bytes,
    mimeType: opts.mimeType,
  });

  const runInsert = await opts.supabase
    .from('extraction_runs')
    .insert({
      receipt_id: opts.receiptId,
      provider: provider.telemetry.provider,
      model: provider.telemetry.model,
      prompt_version: provider.telemetry.prompt_version,
      raw_response: provider.raw ?? null,
      parsed_output: provider.ok ? provider.data : null,
      input_tokens: provider.telemetry.input_tokens,
      output_tokens: provider.telemetry.output_tokens,
      latency_ms: provider.telemetry.latency_ms,
      cost_usd: provider.telemetry.cost_usd,
      error: provider.ok ? null : provider.error,
    })
    .select('id')
    .single();

  const runId = runInsert.data?.id ?? 'unknown';

  if (!provider.ok) {
    return { ok: false, error: provider.error, runId };
  }
  return { ok: true, data: provider.data, runId };
}

export type { ExtractedReceipt };
