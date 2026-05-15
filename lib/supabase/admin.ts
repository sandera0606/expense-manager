import 'server-only';

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Service-role Supabase client. RLS is bypassed — only use for trusted
// server-side work (e.g. background jobs, webhook handlers that can't carry
// a user session). NEVER expose to the browser.
// =============================================================================

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
