'use server';

import { redirect } from 'next/navigation';

import { verifySession } from '@/lib/auth/dal';
import { ingestUpload, type IngestResult } from '@/lib/ingestion/upload';
import { createClient } from '@/lib/supabase/server';
import type { ReceiptStatus } from '@/types/canonical';

export type UploadState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

async function ingestFromFormData(
  formData: FormData,
  device: 'desktop' | 'mobile_scan'
): Promise<IngestResult> {
  const session = await verifySession();
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a file to upload.' };
  }

  const supabase = await createClient();
  const buf = new Uint8Array(await file.arrayBuffer());

  return ingestUpload({
    supabase,
    event: {
      user_id: session.userId,
      source_kind: 'upload',
      source_ref: { original_name: file.name, device },
      bytes: buf,
      mime_type: file.type,
      filename: file.name,
    },
  });
}

// Form-action variant used by the desktop <Dropzone>. Redirects on success
// so the user lands on the receipt detail page.
export async function uploadReceipt(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const result = await ingestFromFormData(formData, 'desktop');

  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  redirect(
    result.duplicate
      ? `/receipts/${result.receiptId}?dup=exact`
      : `/receipts/${result.receiptId}`
  );
}

// Non-redirecting variant for the mobile burst flow. The client kicks off
// many of these in parallel and renders per-receipt status in a thumbnail
// strip — it needs a serializable return, not a navigation.
export type ScanUploadResult =
  | {
      ok: true;
      receiptId: string;
      status: ReceiptStatus;
      duplicate?: boolean;
    }
  | { ok: false; error: string };

export async function uploadScannedReceipt(
  formData: FormData
): Promise<ScanUploadResult> {
  const result = await ingestFromFormData(formData, 'mobile_scan');

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    receiptId: result.receiptId,
    status: result.status,
    duplicate: result.duplicate,
  };
}
