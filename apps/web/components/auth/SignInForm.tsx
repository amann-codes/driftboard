'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  email?: string;
  password?: string;
};

function validateEmail(value: string) {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
}

function validatePassword(value: string) {
  if (!value) return 'Enter your password.';
}

function friendlyError(message?: string) {
  const normalized = message?.toLowerCase() ?? '';
  if (
    normalized.includes('invalid email or password') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('incorrect password') ||
    normalized.includes('wrong password')
  ) {
    return 'The email or password you entered is incorrect.';
  }
  if (normalized.includes('too many') || normalized.includes('rate limit')) {
    return 'Too many sign-in attempts. Wait a moment and try again.';
  }
  return 'We could not sign you in. Please try again.';
}

export default function SignInForm({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setServerError('');
    if (errors.email) setErrors(previous => ({ ...previous, email: validateEmail(value) }));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setServerError('');
    if (errors.password) setErrors(previous => ({ ...previous, password: validatePassword(value) }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: FieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(nextErrors);
    setServerError('');
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (result.error) {
        setServerError(friendlyError(result.error.message));
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.assign('/');
      }
    } catch {
      setServerError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-10 flex items-center gap-2.5 text-lg font-bold tracking-tight text-drift-heading lg:hidden">
        <span className="grid size-8 place-items-center rounded-lg bg-drift-ink text-sm font-bold text-white">D</span>
        Driftboard
      </div>

      <header>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-drift-ink sm:text-4xl">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-drift-body sm:text-base">
          Sign in to pick up where your team left off.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5" aria-busy={submitting}>
        <div>
          <label htmlFor="signin-email" className="block text-sm font-medium text-drift-ink">
            Email
          </label>
          <div className="relative mt-2">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </span>
            <input
              id="signin-email"
              name="email"
              type="email"
              value={email}
              onChange={event => handleEmailChange(event.target.value)}
              onBlur={() => setErrors(previous => ({ ...previous, email: validateEmail(email) }))}
              placeholder="you@company.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'signin-email-error' : undefined}
              className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3.5 text-sm text-drift-ink shadow-sm outline-none transition placeholder:text-slate-400 ${
                errors.email
                  ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200/60'
                  : 'border-drift-line focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20'
              }`}
            />
          </div>
          {errors.email && (
            <p id="signin-email-error" className="mt-1.5 text-xs font-medium text-red-600">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signin-password" className="block text-sm font-medium text-drift-ink">
            Password
          </label>
          <div className="relative mt-2">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <input
              id="signin-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={event => handlePasswordChange(event.target.value)}
              onBlur={() => setErrors(previous => ({ ...previous, password: validatePassword(password) }))}
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'signin-password-error' : undefined}
              className={`h-11 w-full rounded-lg border bg-white pl-10 pr-11 text-sm text-drift-ink shadow-sm outline-none transition placeholder:text-slate-400 ${
                errors.password
                  ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200/60'
                  : 'border-drift-line focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg border-0 bg-transparent p-0 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-drift-accent"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="m3 3 18 18" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c5.5 0 9 5.5 9 7a10.4 10.4 0 0 1-2.3 3.2" />
                  <path d="M6.2 6.2A11.2 11.2 0 0 0 3 12c0 1.5 3.5 7 9 7a10.9 10.9 0 0 0 4.1-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7S18 19 12 19s-9.5-7-9.5-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p id="signin-password-error" className="mt-1.5 text-xs font-medium text-red-600">
              {errors.password}
            </p>
          )}
        </div>

        {serverError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border-0 bg-drift-accent px-4 text-sm font-medium text-white shadow-sm transition hover:bg-drift-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-drift-body">
        New to Driftboard?{' '}
        <a
          href="/signup/"
          className="rounded-sm font-medium text-drift-accent transition hover:text-drift-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-accent focus-visible:ring-offset-2"
        >
          Create an account
        </a>
      </p>
    </div>
  );
}
