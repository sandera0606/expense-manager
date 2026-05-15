'use client';

import { motion, useReducedMotion } from 'framer-motion';

// =============================================================================
// Edit me. This single block controls every word, link, and accent on the
// landing page. No hunting through JSX.
// =============================================================================
const CONTENT = {
  title: "Ha'penny",
  blurb:
    "A ha'penny is a coin you slide across a pub board, trying to land it in just the right spot. This one's a bookkeeping app. Tell it where things should go, and it slides into place.",
  status: 'building · 2026',
  repo: {
    label: 'Visit the repo',
    href: 'https://github.com/sandera0606/expense-manager',
  },
  builtBy: 'Sandra Huang',
  // Where clicking on your name in the footer lands. Personal site is the
  // common pick; swap to LinkedIn / blog as you like.
  builtByHref: 'https://www.linkedin.com/in/shuang0616/',
  socials: [
    { name: 'github', label: 'GitHub', href: 'https://github.com/sandera0606' },
    { name: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/shuang0616/' },
    { name: 'site', label: 'Personal site', href: 'https://shuang.vercel.app/' },
  ],
  // Single accent — swap to taste. oklch keeps it consistent with the rest of
  // the app's color system.
  accent: 'oklch(0.82 0.17 85)', // warm mustard
  accentInk: 'oklch(0.25 0.05 80)',
} as const;
// =============================================================================

// Inline font stacks so we never fall back to browser-default serif. These
// reference the CSS variables that `app/layout.tsx` sets via next/font/google.
const FONT_DISPLAY =
  "var(--font-outfit), 'Outfit', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_BODY =
  "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO =
  "var(--font-geist-mono), ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

export default function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#FBF7EE] text-neutral-900"
      style={
        {
          fontFamily: FONT_BODY,
          ['--hp-accent' as string]: CONTENT.accent,
          ['--hp-accent-ink' as string]: CONTENT.accentInk,
        } as React.CSSProperties
      }
    >
      <FloatingShapes reduce={!!reduce} />

      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center sm:px-8">
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="pb-2 font-black leading-[0.95] tracking-[-0.05em] text-neutral-900 sm:pb-4"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 'clamp(4.5rem, 18vw, 15rem)',
          }}
        >
          Ha<span style={{ color: 'var(--hp-accent-ink)' }}>&rsquo;</span>penny
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 max-w-xl text-sm leading-relaxed text-neutral-600 sm:mt-20 sm:text-base"
          style={{ fontFamily: FONT_BODY }}
        >
          {CONTENT.blurb}
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-14 flex flex-col items-center gap-5 sm:mt-16 sm:flex-row sm:gap-6"
        >
          <a
            href={CONTENT.repo.href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg sm:text-base"
            style={{
              background: 'var(--hp-accent)',
              color: 'var(--hp-accent-ink)',
              fontFamily: FONT_BODY,
            }}
          >
            {CONTENT.repo.label}
            <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </a>
          <span
            className="text-xs uppercase tracking-[0.2em] text-neutral-500"
            style={{ fontFamily: FONT_MONO }}
          >
            {CONTENT.status}
          </span>
        </motion.div>
      </section>

      <footer
        className="relative z-10 px-6 pb-8 sm:px-12 sm:pb-10"
        style={{ fontFamily: FONT_BODY }}
      >
        <div className="mx-auto h-px w-full max-w-5xl bg-neutral-900/10" />
        <div className="mx-auto mt-5 flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
          <span>
            built by{' '}
            <a
              href={CONTENT.builtByHref}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-neutral-900 underline-offset-4 transition hover:underline"
            >
              {CONTENT.builtBy}
            </a>
          </span>
          <ul className="flex items-center gap-2">
            {CONTENT.socials.map((s) => (
              <li key={s.name}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="inline-flex size-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-900/5 hover:text-neutral-900"
                >
                  <SocialIcon name={s.name} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </main>
  );
}

// =============================================================================
// Drifting geometric accents. Positioned with fixed pixel offsets from each
// viewport corner (not %), so they stay hugged to the edges and can't crowd
// the centered content even on short or narrow screens. Hidden by default on
// the smallest screens (where there's no room) and re-shown at sm:.
// =============================================================================
function FloatingShapes({ reduce }: { reduce: boolean }) {
  const shapes = [
    { kind: 'triangle', pos: 'top-8 right-6 sm:top-12 sm:right-12', size: 'size-16 sm:size-28', rotate: 14, dur: 11, opacity: 0.7 },
    { kind: 'plus',     pos: 'top-10 left-6 sm:top-14 sm:left-12',  size: 'size-10 sm:size-16', rotate: -10, dur: 12, opacity: 0.75 },
    { kind: 'circle',   pos: 'bottom-24 right-6 sm:bottom-28 sm:right-14', size: 'size-12 sm:size-20', rotate: 0, dur: 13, opacity: 0.8 },
    { kind: 'bar',      pos: 'bottom-24 left-6 sm:bottom-28 sm:left-14',   size: 'size-14 sm:size-24', rotate: -22, dur: 14, opacity: 0.7 },
  ] as const;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {shapes.map((s, i) => (
        <motion.div
          key={i}
          className={`absolute ${s.pos} ${s.size}`}
          style={{ opacity: s.opacity }}
          initial={{ rotate: s.rotate, y: 0 }}
          animate={
            reduce
              ? { rotate: s.rotate, y: 0 }
              : { rotate: [s.rotate, s.rotate + 5, s.rotate - 3, s.rotate], y: [0, -10, 4, 0] }
          }
          transition={
            reduce
              ? undefined
              : { duration: s.dur, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          <Shape kind={s.kind} />
        </motion.div>
      ))}
    </div>
  );
}

function SocialIcon({ name }: { name: 'github' | 'linkedin' | 'site' }) {
  const common = 'size-[18px]';
  if (name === 'github') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.111.82-.261.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.467-2.382 1.235-3.222-.123-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23.957-.266 1.983-.4 3.003-.404 1.02.004 2.047.138 3.006.404 2.29-1.552 3.296-1.23 3.296-1.23.653 1.653.242 2.874.118 3.176.77.84 1.234 1.912 1.234 3.222 0 4.61-2.804 5.625-5.476 5.92.43.37.823 1.103.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .319.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z" />
      </svg>
    );
  }
  if (name === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={common}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 4 9 14 14 0 0 1-4 9 14 14 0 0 1-4-9 14 14 0 0 1 4-9z" />
    </svg>
  );
}

function Shape({ kind }: { kind: 'triangle' | 'circle' | 'plus' | 'bar' }) {
  const fill = 'var(--hp-accent)';
  const ink = 'var(--hp-accent-ink)';
  if (kind === 'triangle') {
    return (
      <svg viewBox="0 0 100 100" className="size-full">
        <polygon points="50,8 92,88 8,88" fill={fill} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'circle') {
    return (
      <svg viewBox="0 0 100 100" className="size-full">
        <circle cx="50" cy="50" r="42" fill="none" stroke={ink} strokeWidth="6" />
        <circle cx="50" cy="50" r="22" fill={fill} />
      </svg>
    );
  }
  if (kind === 'plus') {
    return (
      <svg viewBox="0 0 100 100" className="size-full">
        <rect x="42" y="8" width="16" height="84" rx="4" fill={ink} />
        <rect x="8" y="42" width="84" height="16" rx="4" fill={ink} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 40" className="size-full">
      <rect x="2" y="6" width="96" height="28" rx="14" fill={fill} stroke={ink} strokeWidth="3" />
    </svg>
  );
}
