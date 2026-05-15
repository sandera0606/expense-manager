import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Data Access Layer — the only place that decides "is this request authed?".
// All Server Components / Server Actions / Route Handlers that read user data
// should call verifySession() first. Memoized with React.cache so the same
// request only validates once.
// =============================================================================

export const verifySession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect('/login');
  }
  return { userId: data.user.id, email: data.user.email ?? null };
});

// Variant that returns null instead of redirecting. Useful for the /login page
// itself, which needs to bounce already-authed users to /feed.
export const tryVerifySession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
});
