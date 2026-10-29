'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentReturnPath, withReturnPath } from '@/lib/return-to';
import Brand from '@/components/workspace/Brand';
import { RefreshIcon } from '@/components/workspace/icons';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/workspace/styles';

type EntryState = 'checking' | 'error';

export default function Home() {
  const [state, setState] = useState<EntryState>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    const enter = async () => {
      setState('checking');
      try {
        await api('/api/me');
        if (!active) return;
        window.location.replace('/dashboard/');
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem('driftboard.me');
          window.location.replace(withReturnPath('/signin/', currentReturnPath('/dashboard/')));
          return;
        }
        setState('error');
      }
    };

    void enter();
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f8fb] px-5 py-10 text-drift-ink">
      <section className="w-full max-w-sm text-center" aria-live="polite">
        <div className="flex justify-center">
          <Brand />
        </div>

        {state === 'checking' ? (
          <div className="mt-8" role="status" aria-label="Opening Driftboard">
            <span className="mx-auto block size-6 animate-spin rounded-full border-2 border-slate-200 border-t-drift-accent" />
            <p className="mt-4 text-sm text-drift-body">Opening your workspace…</p>
          </div>
        ) : (
          <div role="alert" className="mt-8 rounded-2xl border border-drift-line bg-white p-6">
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-drift-ink">We couldn&apos;t open Driftboard</h1>
            <p className="mt-2 text-sm leading-6 text-drift-body">
              Check your connection and try again. If the problem continues, make sure the server is running.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={() => setAttempt(value => value + 1)} className={PRIMARY_BUTTON}>
                <RefreshIcon className="size-4" />
                Try again
              </button>
              <a href="/signin/" className={SECONDARY_BUTTON}>
                Go to sign in
              </a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
