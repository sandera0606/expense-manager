// =============================================================================
// Canonical financial data types — must mirror lib/db/schema.sql exactly.
// The UI never reads ingestion or source tables — it reads these.
// =============================================================================

export type ReceiptStatus =
  | 'pending'
  | 'extracting'
  | 'extracted'
  | 'failed'
  | 'needs_review';

export type SourceKind =
  | 'upload'
  | 'email'
  | 'gmail'
  | 'outlook'
  | 'drive'
  | 'dropbox';

export type Receipt = {
  id: string;
  user_id: string;
  storage_path: string;
  mime_type: string;
  source_kind: SourceKind;
  source_ref: Record<string, unknown> | null;
  status: ReceiptStatus;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  receipt_id: string | null;
  occurred_at: string;
  merchant: string | null;
  merchant_normalized: string | null;
  total_amount: number;
  currency: string;
  payment_method: string | null;
  category_id: string | null;
  notes: string | null;
  confidence: number | null;
  created_at: string;
  updated_at: string;
};

export type TransactionLineItem = {
  id: string;
  transaction_id: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number;
  position: number;
  category_id: string | null;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type ExtractionRun = {
  id: string;
  receipt_id: string;
  provider: 'anthropic' | 'openai';
  model: string;
  prompt_version: string;
  raw_response: unknown;
  parsed_output: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
};

// Fields on a transaction that can be referenced from a Layout's ViewQuery /
// card field list. Keep this in sync with what the renderer + query layer
// know how to project.
export const TRANSACTION_FIELDS = [
  'occurred_at',
  'merchant',
  'merchant_normalized',
  'total_amount',
  'currency',
  'payment_method',
  'category_id',
  'notes',
  'confidence',
] as const;

export type TransactionField = (typeof TRANSACTION_FIELDS)[number];
