'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

const addSchema = z.object({
  name: z.string().trim().min(1, { error: 'Name required' }).max(80),
});

export type CategoryActionState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'error'; message: string };

export async function addCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await verifySession();
  const parsed = addSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid name',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('categories').insert({
    user_id: session.userId,
    name: parsed.data.name,
  });
  if (error) {
    if (error.code === '23505') {
      return { status: 'error', message: 'A category with that name already exists.' };
    }
    return { status: 'error', message: error.message };
  }

  revalidatePath('/settings/categories');
  return { status: 'ok' };
}

export async function deleteCategory(id: string): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  // ON DELETE SET NULL on transactions.category_id keeps history intact;
  // the transactions just become uncategorized.
  await supabase.from('categories').delete().eq('id', id);
  revalidatePath('/settings/categories');
}
