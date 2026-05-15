import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { extractReceipt } from '@/lib/ai';
import { normalizeReceipt } from '@/lib/ingestion/normalize';
import type { IngestionEvent } from '@/lib/ingestion/types';
import type { Receipt, ReceiptStatus } from '@/types/canonical';

// =============================================================================
// Phase-1 ingestion: a file the user uploaded by hand.
// Runs the full pipeline synchronously for the MVP:
//   storage write → receipts row → extract → normalize → status update.
// Phase 2+ will move extract/normalize into a queue without changing callers.
// =============================================================================

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export type IngestResult =
  | {
      ok: true;
      receiptId: string;
      transactionId: string | null;
      status: ReceiptStatus;
      // Set when we short-circuited because the same file was already
      // ingested for this user. The receiptId points at the existing row.
      duplicate?: boolean;
    }
  | { ok: false; error: string };

export async function ingestUpload(opts: {
  supabase: SupabaseClient;
  event: IngestionEvent;
}): Promise<IngestResult> {
  const { supabase, event } = opts;

  if (!ALLOWED_MIME.has(event.mime_type)) {
    return { ok: false, error: `Unsupported file type: ${event.mime_type}` };
  }
  if (event.bytes.byteLength > MAX_BYTES) {
    return { ok: false, error: 'File exceeds 20 MB limit' };
  }

  // SHA-256 of the bytes → check for exact duplicates BEFORE uploading or
  // extracting. Same-file re-uploads are common (camera burst, email forward
  // already imported, Composio later picking up the same Gmail thread).
  const fileHash = await sha256Hex(event.bytes);

  const { data: existing } = await supabase
    .from('receipts')
    .select('id, status')
    .eq('user_id', event.user_id)
    .eq('file_hash', fileHash)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      receiptId: existing.id,
      transactionId: null,
      status: existing.status as ReceiptStatus,
      duplicate: true,
    };
  }

  const receiptId = crypto.randomUUID();
  const ext = mimeToExt(event.mime_type);
  const storagePath = `${event.user_id}/${receiptId}.${ext}`;

  const uploadRes = await supabase.storage
    .from('receipts')
    .upload(storagePath, event.bytes, {
      contentType: event.mime_type,
      upsert: false,
    });
  if (uploadRes.error) {
    return { ok: false, error: `Upload failed: ${uploadRes.error.message}` };
  }

  const { data: receipt, error: receiptErr } = await supabase
    .from('receipts')
    .insert({
      id: receiptId,
      user_id: event.user_id,
      storage_path: storagePath,
      mime_type: event.mime_type,
      source_kind: event.source_kind,
      source_ref: event.source_ref,
      file_hash: fileHash,
      status: 'extracting' satisfies ReceiptStatus,
    })
    .select('id')
    .single();
  if (receiptErr || !receipt) {
    return {
      ok: false,
      error: `Receipt row insert failed: ${receiptErr?.message ?? 'unknown'}`,
    };
  }

  const extraction = await extractReceipt({
    supabase,
    receiptId,
    bytes: event.bytes,
    mimeType: event.mime_type,
  });

  if (!extraction.ok) {
    await supabase
      .from('receipts')
      .update({ status: 'failed' satisfies ReceiptStatus })
      .eq('id', receiptId);
    return { ok: true, receiptId, transactionId: null, status: 'failed' };
  }

  const normalized = await normalizeReceipt({
    supabase,
    userId: event.user_id,
    receiptId,
    extracted: extraction.data,
  });

  if (!normalized.ok) {
    await supabase
      .from('receipts')
      .update({ status: 'failed' satisfies ReceiptStatus })
      .eq('id', receiptId);
    return { ok: true, receiptId, transactionId: null, status: 'failed' };
  }

  const finalStatus: ReceiptStatus = normalized.needsReview
    ? 'needs_review'
    : 'extracted';
  await supabase
    .from('receipts')
    .update({ status: finalStatus })
    .eq('id', receiptId);

  return {
    ok: true,
    receiptId,
    transactionId: normalized.transactionId,
    status: finalStatus,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

export type { Receipt };
