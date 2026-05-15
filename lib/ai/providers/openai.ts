import 'server-only';

import type { ProviderExtractionResult } from './anthropic';

// =============================================================================
// OpenAI provider stub. Kept as a swap-in path; not implemented yet.
// When implemented, this should produce the same ProviderExtractionResult
// shape so lib/ai/index.ts can switch providers without touching callers.
// =============================================================================

export async function extractReceiptWithOpenAI(_input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ProviderExtractionResult> {
  throw new Error(
    'OpenAI provider is a stub. Implement when adding multi-provider support.'
  );
}
