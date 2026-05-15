'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/auth/dal';
import { viewQuerySchema } from '@/lib/layout/schemas';
import { createClient } from '@/lib/supabase/server';

export async function submitQuestion(formData: FormData) {
  await verifySession();
  const q = String(formData.get('q') ?? '').trim();
  if (!q) redirect('/ask');
  redirect(`/ask?q=${encodeURIComponent(q)}`);
}

export async function saveAsView(formData: FormData) {
  const session = await verifySession();
  const name = String(formData.get('name') ?? '').trim();
  const queryRaw = String(formData.get('query') ?? '');
  if (!name) return;

  let parsedQuery;
  try {
    parsedQuery = viewQuerySchema.parse(JSON.parse(queryRaw));
  } catch {
    return;
  }

  const supabase = await createClient();
  await supabase.from('views').insert({
    user_id: session.userId,
    name,
    query: parsedQuery,
  });
  revalidatePath('/views');
  redirect('/views');
}
