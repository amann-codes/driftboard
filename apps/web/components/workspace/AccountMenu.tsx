'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { authClient } from '@/lib/auth-client';
import type { WorkspaceUser } from '@/lib/workspace';
import { clearWorkspaceCache } from '@/lib/workspace-cache';
import { ChevronDownIcon, SignOutIcon } from './icons';
import { FOCUS_RING } from './styles';
import { useToast } from './Toast';

export default function AccountMenu({ user }: { user?: WorkspaceUser }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) detailsRef.current.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
      clearWorkspaceCache();
      window.location.assign('/signin/');
    } catch {
      setSigningOut(false);
      toast.push({ kind: 'error', message: "We couldn't sign you out. Check your connection and try again." });
    }
  };

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label={`Account menu for ${user?.name ?? 'current user'}`}
        className={`flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-transparent px-1.5 text-sm transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
      >
        {user ? (
          <Avatar id={user.id} name={user.name} />
        ) : (
          <span className="grid size-[26px] place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">?</span>
        )}
        <span className="hidden max-w-36 truncate font-medium text-drift-ink sm:block">{user?.name ?? 'Account'}</span>
        <ChevronDownIcon className="hidden size-3.5 text-slate-400 sm:block" />
      </summary>

      <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-drift-line bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
        <div className="border-b border-drift-line px-4 py-3">
          <p className="truncate text-sm font-medium text-drift-ink">{user?.name ?? 'Your account'}</p>
          {user?.email && <p className="mt-0.5 truncate text-xs text-drift-muted">{user.email}</p>}
        </div>
        <div className="p-1.5">
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className={`flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <SignOutIcon className="size-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </details>
  );
}
