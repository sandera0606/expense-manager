// =============================================================================
// Only entry point feature code should import from for AI work.
// Do NOT import @anthropic-ai/* directly anywhere in app/, components/, or
// lib/ingestion/. Route everything through this barrel.
// =============================================================================

export { extractReceipt } from './extract-receipt';
export type { ExtractedReceipt, ExtractionResult } from '@/types/ai';
