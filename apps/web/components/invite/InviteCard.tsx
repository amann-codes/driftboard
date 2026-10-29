'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { withReturnPath } from '@/lib/return-to';

type InviteDetails = {
  orgName: string;
  role: string;
};

type Status = 'loading' | 'unauthenticated' | 'ready' | 'submitting' | 'success' | 'invalid' | 'error';

const PRIMARY =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border-0 bg-drift-accent px-4 text-sm font-medium text-white no-underline shadow-sm transition hover:bg-drift-accent-hover hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const SECONDARY =
  'inline-flex h-11 w-full items-center justify-center rounded-lg border border-drift-line bg-white px-4 text-sm font-medium text-drift-ink no-underline transition hover:bg-drift-surface hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-accent focus-visible:ring-offset-2';

const ICON =
  'grid size-12 place-items-center rounded-2xl bg-drift-accent-soft text-drift-accent';

function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function isUnavailable(status?: number) {
  return status === 400 || status === 404 || status === 410;
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function InviteCard() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState('');
  const accepting = useRef(false);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    };
  }, []);

  const load = useCallback(async (inviteToken: string) => {
    setStatus('loading');
    setError('');
    try {
      const data = await api<InviteDetails>(`/api/invites/${encodeURIComponent(inviteToken)}`);
      setInvite(data);
      setStatus('ready');
    } catch (requestError: any) {
      if (requestError?.status === 401) {
        setStatus('unauthenticated');
        return;
      }
      if (isUnavailable(requestError?.status)) {
        setStatus('invalid');
        return;
      }
      setError("We couldn't check this invitation. Check your connection and try again.");
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(inviteToken);
    if (!inviteToken) {
      setStatus('invalid');
      return;
    }
    void load(inviteToken);
  }, [load]);

  const accept = async () => {
    if (!token || accepting.current) return;
    accepting.current = true;
    setStatus('submitting');
    setError('');
    try {
      await api(`/api/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
      setStatus('success');
      redirectTimer.current = window.setTimeout(() => window.location.assign('/'), 900);
    } catch (requestError: any) {
      accepting.current = false;
      if (requestError?.status === 401) {
        setStatus('unauthenticated');
        return;
      }
      if (isUnavailable(requestError?.status)) {
        setStatus('invalid');
        return;
      }
      setError("We couldn't accept this invitation. Check your connection and try again.");
      setStatus('ready');
    }
  };

  const returnTo = token ? `/invite/?token=${encodeURIComponent(token)}` : '/';
  const signInHref = withReturnPath('/signin/', returnTo);
  const signUpHref = withReturnPath('/signup/', returnTo);
  const isSubmitting = status === 'submitting';

  let body: ReactNode;

  if (status === 'loading') {
    body = (
      <div role="status" aria-live="polite" className="flex flex-col items-center py-4 text-center">
        <span className={ICON}>
          <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-drift-accent/30 border-t-drift-accent" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-drift-ink">Checking your invitation…</h1>
        <p className="mt-2 text-sm leading-6 text-drift-body">Just a moment while we verify the link.</p>
        <div aria-hidden className="mt-6 w-full space-y-3">
          <div className="mx-auto h-3 w-2/3 animate-pulse rounded-full bg-slate-100" />
          <div className="mx-auto h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    );
  } else if (status === 'unauthenticated') {
    body = (
      <div className="text-center">
        <div className={`mx-auto ${ICON}`}>
          <MailIcon />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-drift-ink">You&apos;ve been invited</h1>
        <p className="mt-2 text-sm leading-6 text-drift-body">
          Sign in or create an account to see the invitation details and join your team on Driftboard.
        </p>
        <div className="mt-6 space-y-3">
          <a href={signInHref} className={PRIMARY}>
            Sign in to continue
          </a>
          <a href={signUpHref} className={SECONDARY}>
            Create account
          </a>
        </div>
        <p className="mt-5 text-xs leading-5 text-drift-muted">You&apos;ll return to this invitation after signing in.</p>
      </div>
    );
  } else if (status === 'invalid') {
    body = (
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-drift-peach text-amber-700">
          <ErrorIcon />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-drift-ink">This invitation isn&apos;t available</h1>
        <p className="mt-2 text-sm leading-6 text-drift-body">
          {token
            ? 'It may have expired or been revoked. Ask the person who invited you to send a new link.'
            : 'This invitation link is incomplete. Ask the person who invited you to send a new link.'}
        </p>
        <a href="/" className={`mt-6 ${PRIMARY}`}>
          Back to Driftboard
        </a>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div role="alert" className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-drift-peach text-amber-700">
          <ErrorIcon />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-drift-ink">We couldn&apos;t check this invitation</h1>
        <p className="mt-2 text-sm leading-6 text-drift-body">{error}</p>
        <div className="mt-6 space-y-3">
          <button type="button" onClick={() => void load(token)} className={PRIMARY}>
            Try again
          </button>
          <a href="/" className={SECONDARY}>
            Back to Driftboard
          </a>
        </div>
      </div>
    );
  } else if (status === 'success') {
    body = (
      <div role="status" aria-live="polite" className="flex flex-col items-center py-4 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckIcon />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-drift-ink">You&apos;re in</h1>
        <p className="mt-2 text-sm leading-6 text-drift-body">
          You now have access to {invite?.orgName ?? 'the organization'}. Taking you to Driftboard…
        </p>
        <div className="mt-6 flex items-center gap-2 text-sm text-drift-muted">
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-drift-line border-t-drift-accent" />
          Opening your boards
        </div>
      </div>
    );
  } else if (invite) {
    body = (
      <div>
        <div className={ICON}>
          <MailIcon />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-drift-ink">You&apos;ve been invited</h1>
        <p className="mt-2 text-sm leading-6 text-drift-body">
          Join <strong className="font-medium text-drift-ink">{invite.orgName}</strong> on Driftboard to collaborate on shared boards with your team.
        </p>

        <dl className="mt-6 divide-y divide-drift-line overflow-hidden rounded-xl border border-drift-line bg-drift-surface/70">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-[0.08em] text-drift-muted">Organization</dt>
            <dd className="text-right text-sm font-medium text-drift-ink">{invite.orgName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-[0.08em] text-drift-muted">Role</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-drift-heading ring-1 ring-drift-line">
                {roleLabel(invite.role)}
              </span>
            </dd>
          </div>
        </dl>

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button type="button" onClick={accept} disabled={isSubmitting} className={PRIMARY}>
            {isSubmitting ? (
              <>
                <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Joining…
              </>
            ) : (
              'Accept invitation'
            )}
          </button>
          <a href="/" className={SECONDARY}>
            Not now
          </a>
        </div>
      </div>
    );
  } else {
    body = null;
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(160deg,#f8fafc_0%,#eef2ff_58%,#fbfaff_100%)] px-5 py-10 text-drift-ink sm:px-8">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-1/4 size-64 rounded-full bg-drift-lilac/35 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-1/4 size-64 rounded-full bg-drift-accent-soft blur-3xl" />
      <section className="relative w-full max-w-md" aria-label="Driftboard invitation">
        <div className="mb-5 flex items-center justify-center gap-2.5 text-lg font-bold tracking-tight text-drift-heading">
          <span className="grid size-8 place-items-center rounded-lg bg-drift-ink text-sm font-bold text-white">D</span>
          Driftboard
        </div>
        <div
          aria-busy={status === 'loading' || isSubmitting}
          className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-drift-heading/5 sm:p-8"
        >
          {body}
        </div>
      </section>
    </main>
  );
}
