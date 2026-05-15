import type { SourceKind } from '@/types/canonical';

// =============================================================================
// IngestionEvent — every ingestion source (upload, email, Gmail, Drive, ...)
// produces this generic shape. The canonical schema never references source-
// specific fields; it only sees IngestionEvent → ExtractedReceipt → canonical.
// =============================================================================

export type IngestionEvent = {
  user_id: string;
  source_kind: SourceKind;
  source_ref: Record<string, unknown> | null;
  bytes: Uint8Array;
  mime_type: string;
  // Filename hint (not stored canonically; used to derive storage extension).
  filename?: string;
};
