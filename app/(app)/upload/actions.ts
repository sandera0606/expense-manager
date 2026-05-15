'use server';

import { redirect } from 'next/navigation';

import { verifySession } from '@/lib/auth/dal';
import { ingestUpload } from '@/lib/ingestion/upload';
import { createClient } from '@/lib/supabase/server';

export type UploadState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function uploadReceipt(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const session = await verifySession();
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file to upload.' };
  }

  const supabase = await createClient();
  const buf = new Uint8Array(await file.arrayBuffer());

  const result = await ingestUpload({
    supabase,
    event: {
      user_id: session.userId,
      source_kind: 'upload',
      source_ref: { original_name: file.name },
      bytes: buf,
      mime_type: file.type,
      filename: file.name,
    },
  });

  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  // Successful ingest — whether or not extraction succeeded, the receipt row
  // exists. If this was a duplicate (same file already on file), tell the
  // receipt page so it can surface a banner.
  redirect(
    result.duplicate
      ? `/receipts/${result.receiptId}?dup=exact`
      : `/receipts/${result.receiptId}`
  );
}
