'use client';

import type { ReactNode } from 'react';
import Brand from '@/components/workspace/Brand';
import { AlertIcon, BoardIcon, RefreshIcon } from '@/components/workspace/icons';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/workspace/styles';
import { LockIcon } from './icons';

export function BoardLoading() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f7f8fb]" aria-busy="true" aria-label="Loading board">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-drift-line bg-white px-4 sm:h-16">
        <div className="size-9 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-4 w-44 animate-pulse rounded-full bg-slate-100" />
        <div className="ml-auto flex gap-2">
          <div className="size-9 animate-pulse rounded-full bg-slate-100" />
          <div className="size-9 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="flex flex-1 gap-4 overflow-hidden p-4 sm:p-6">
        {[0, 1, 2, 3].map(column => (
          <div key={column} className="w-[272px] shrink-0 animate-pulse rounded-xl bg-slate-100/80 p-3">
            <div className="h-5 w-28 rounded-full bg-white/80" />
            <div className="mt-3 space-y-2">
              <div className="h-20 rounded-lg bg-white" />
              <div className="h-16 rounded-lg bg-white" />
              <div className="h-24 rounded-lg bg-white" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardUnavailable({
  title,
  message,
  icon,
  retry = false,
  backHref = '/dashboard/',
  backLabel = 'Back to dashboard',
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  retry?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f7f8fb]">
      <header className="flex h-16 shrink-0 items-center border-b border-drift-line bg-white px-4 sm:px-6">
        <Brand />
      </header>
      <main className="grid flex-1 place-items-center px-5 py-12">
        <section role={retry ? 'alert' : undefined} className="w-full max-w-md rounded-2xl border border-drift-line bg-white p-7 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-drift-accent-soft text-drift-accent">
            {icon ?? <AlertIcon />}
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-drift-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-drift-body">{message}</p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
            {retry && (
              <button type="button" onClick={() => window.location.reload()} className={PRIMARY_BUTTON}>
                <RefreshIcon className="size-4" />
                Try again
              </button>
            )}
            <a href={backHref} className={SECONDARY_BUTTON}>
              {backLabel}
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

export function BoardMissing() {
  return (
    <BoardUnavailable
      title="No board selected"
      message="Choose a board from your dashboard or open one from a project."
      icon={<BoardIcon />}
      backHref="/dashboard/"
    />
  );
}

export function BoardLocked() {
  return (
    <BoardUnavailable
      title="This board is open in another tab"
      message="Close the other tab before editing here. This protects changes that have not synced yet."
      icon={<LockIcon />}
      retry
    />
  );
}
