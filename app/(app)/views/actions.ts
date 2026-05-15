'use server';

import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

export async function deleteView(formData: FormData) {
  await verifySession();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const supabase = await createClient();
  await supabase.from('views').delete().eq('id', id);
  revalidatePath('/views');
}
