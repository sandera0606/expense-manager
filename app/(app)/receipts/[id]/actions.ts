'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Remove the receipt only — file + receipts row + extraction_runs (cascade).
// The linked transaction stays put with receipt_id = null. Use this when the
// canonical transaction is correct but you no longer need to retain the
// source image / PDF.
// =============================================================================

export async function deleteReceiptOnly(id: string): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from('receipts')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (receipt?.storage_path) {
    await supabase.storage.from('receipts').remove([receipt.storage_path]);
  }
  await supabase.from('receipts').delete().eq('id', id);

  revalidatePath('/feed');
  revalidatePath('/inbox');
  redirect('/feed');
}
