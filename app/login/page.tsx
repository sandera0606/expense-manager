import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { tryVerifySession } from '@/lib/auth/dal';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            We&rsquo;ll email you a one-time sign-in link.
          </p>
        </header>
        <Suspense fallback={<LoginForm />}>
          <Gate />
        </Suspense>
      </div>
    </main>
  );
}

async function Gate() {
  const session = await tryVerifySession();
  if (session) redirect('/feed');
  return <LoginForm />;
}
