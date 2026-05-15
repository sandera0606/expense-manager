import Link from 'next/link';
import { Suspense } from 'react';

import { verifySession } from '@/lib/auth/dal';

// =============================================================================
// Authed shell. Render the nav frame synchronously so the static shell can
// prerender; the user-email chip streams in via <Suspense>.
//
// verifySession() (which reads cookies) is called inside the streamed
// <UserChip>, satisfying Cache Components' "uncached data must be inside a
// Suspense boundary" rule.
// =============================================================================

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 text-sm">
          <Link href="/feed" className="font-semibold tracking-tight">
            Ledger
          </Link>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Link href="/feed" className="hover:text-foreground">
              Feed
            </Link>
            <Link href="/ask" className="hover:text-foreground">
              Ask
            </Link>
            <Link href="/views" className="hover:text-foreground">
              Views
            </Link>
            <Link href="/inbox" className="hover:text-foreground">
              Inbox
            </Link>
            <Link href="/upload" className="hover:text-foreground">
              Upload
            </Link>
            <Link
              href="/settings/categories"
              className="hidden hover:text-foreground sm:inline"
            >
              Categories
            </Link>
            <Suspense fallback={<span className="hidden sm:inline">…</span>}>
              <UserChip />
            </Suspense>
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

async function UserChip() {
  const session = await verifySession();
  return <span className="hidden sm:inline">{session.email}</span>;
}
