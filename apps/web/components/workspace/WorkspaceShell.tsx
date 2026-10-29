'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { authClient } from '@/lib/auth-client';
import type { WorkspaceUser } from '@/lib/workspace';
import Brand, { BrandMark } from './Brand';
import {
  ChevronDownIcon,
  CloseIcon,
  DashboardIcon,
  MenuIcon,
  OrganizationsIcon,
  SignOutIcon,
} from './icons';
import { FOCUS_RING, GHOST_BUTTON, ICON_BUTTON } from './styles';
import { useToast } from './Toast';

type Breadcrumb = { label: string; href: string };

type WorkspaceShellProps = {
  title: string;
  breadcrumb?: Breadcrumb;
  user?: WorkspaceUser;
  actions?: ReactNode;
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: '/dashboard/', label: 'Dashboard', icon: DashboardIcon, match: '/dashboard' },
  { href: '/organizations/', label: 'Organizations', icon: OrganizationsIcon, match: '/organizations' },
];

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Workspace" className="space-y-1">
      {NAV_ITEMS.map(item => {
        const active = pathname === item.match || pathname.startsWith(`${item.match}/`);
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${FOCUS_RING} ${
              active
                ? 'bg-drift-accent-soft text-drift-accent'
                : 'text-drift-body hover:bg-slate-100 hover:text-drift-ink'
            }`}
          >
            <Icon className={`size-[18px] ${active ? 'text-drift-accent' : 'text-slate-400'}`} />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

function AccountMenu({ user }: { user?: WorkspaceUser }) {
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
      localStorage.removeItem('driftboard.me');
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
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <SignOutIcon className="size-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </details>
  );
}

function Shell({ title, breadcrumb, user, actions, children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const mobileWasOpen = useRef(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = mobilePanelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileWasOpen.current && !mobileOpen) menuButtonRef.current?.focus();
    mobileWasOpen.current = mobileOpen;
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh bg-[#f7f8fb] text-drift-ink [&_a]:no-underline">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-medium text-drift-ink shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-drift-accent"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-drift-line bg-white lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <div className="flex-1 px-3 py-2">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Workspace</p>
          <NavItems pathname={pathname} />
        </div>
        <div className="border-t border-drift-line px-5 py-4">
          <p className="text-xs leading-5 text-drift-muted">Boards keep working offline once opened on this device.</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-drift-line bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="mobile-workspace-navigation"
              className={`${ICON_BUTTON} lg:hidden`}
            >
              <MenuIcon />
            </button>

            <span className="lg:hidden">
              <BrandMark />
            </span>

            <div className="min-w-0 flex-1">
              {breadcrumb && (
                <a
                  href={breadcrumb.href}
                  className={`hidden items-center gap-1 rounded text-xs font-medium text-drift-muted transition hover:text-drift-ink sm:inline-flex ${FOCUS_RING}`}
                >
                  {breadcrumb.label}
                  <span aria-hidden>/</span>
                </a>
              )}
              <h1 title={title} className="truncate text-base font-semibold tracking-[-0.02em] text-drift-ink sm:text-lg">{title}</h1>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {actions}
              <AccountMenu user={user} />
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 outline-none sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            ref={mobilePanelRef}
            id="mobile-workspace-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-drift-line bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <Brand />
              <button
                ref={mobileCloseRef}
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className={GHOST_BUTTON}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 px-3 py-2">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Workspace</p>
              <NavItems pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-drift-line px-5 py-4">
              <p className="text-xs leading-5 text-drift-muted">Boards keep working offline once opened on this device.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceShell(props: WorkspaceShellProps) {
  return <Shell {...props} />;
}
