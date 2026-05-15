'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { sendMagicLink, type LoginState } from './actions';

const initial: LoginState = { status: 'idle' };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === 'sent') {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-muted-foreground">
          A sign-in link was sent to <span className="font-mono">{state.email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoFocus
          placeholder="you@example.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {state.status === 'error' && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  );
}
