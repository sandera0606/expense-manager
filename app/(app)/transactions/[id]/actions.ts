'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

const updateSchema = z.object({
  merchant: z.string().trim().nullable(),
  total_amount: z.coerce.number(),
  currency: z.string().length(3),
  occurred_at: z.string().min(1),
  notes: z.string().nullable(),
});

export type UpdateState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

export async function updateTransaction(
  id: string,
  _prev: UpdateState,
  formData: FormData
): Promise<UpdateState> {
  const session = await verifySession();

  const parsed = updateSchema.safeParse({
    merchant: formData.get('merchant') || null,
    total_amount: formData.get('total_amount'),
    currency: formData.get('currency'),
    occurred_at: formData.get('occurred_at'),
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('transactions')
    .update({
      merchant: parsed.data.merchant,
      total_amount: parsed.data.total_amount,
      currency: parsed.data.currency,
      occurred_at: new Date(parsed.data.occurred_at).toISOString(),
      notes: parsed.data.notes,
    })
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) return { status: 'error', message: error.message };

  revalidatePath('/feed');
  revalidatePath(`/transactions/${id}`);
  return { status: 'saved' };
}

// =============================================================================
// Delete transaction + the receipt it came from (storage file, receipts row,
// and via cascade: line_items + extraction_runs). The canonical record is
// the transaction; the receipt is the source — deleting both is the default
// because keeping an orphan source file is confusing.
// =============================================================================

export async function deleteTransactionAndReceipt(id: string): Promise<void> {
  const session = await verifySession();
  const supabase = await createClient();

  // Find the linked receipt (if any) so we can clean Storage too.
  const { data: txn } = await supabase
    .from('transactions')
    .select('receipt_id')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (txn?.receipt_id) {
    const { data: receipt } = await supabase
      .from('receipts')
      .select('storage_path')
      .eq('id', txn.receipt_id)
      .maybeSingle();
    if (receipt?.storage_path) {
      await supabase.storage.from('receipts').remove([receipt.storage_path]);
    }
    // Deleting the receipt cascades extraction_runs. It does NOT cascade the
    // transaction (foreign key is `on delete set null`), so we delete the
    // transaction explicitly below.
    await supabase.from('receipts').delete().eq('id', txn.receipt_id);
  }

  await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId);

  revalidatePath('/feed');
  revalidatePath('/inbox');
  redirect('/feed');
}
