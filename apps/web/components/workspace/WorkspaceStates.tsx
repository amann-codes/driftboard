import { AlertIcon, RefreshIcon } from './icons';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse space-y-8">
      <div className="rounded-2xl border border-drift-line bg-white p-6 sm:p-7">
        <div className="h-3 w-24 rounded-full bg-slate-100" />
        <div className="mt-4 h-8 w-64 max-w-full rounded-lg bg-slate-100" />
        <div className="mt-3 h-3 w-96 max-w-full rounded-full bg-slate-100" />
      </div>

      <section>
        <div className="mb-4 h-4 w-32 rounded-full bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(item => (
            <div key={item} className="overflow-hidden rounded-2xl border border-drift-line bg-white">
              <div className="h-24 bg-slate-100" />
              <div className="space-y-3 p-4">
                <div className="h-3 w-2/3 rounded-full bg-slate-100" />
                <div className="h-3 w-1/2 rounded-full bg-slate-100" />
                <div className="h-2.5 w-24 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 h-4 w-36 rounded-full bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(item => (
            <div key={item} className="h-48 rounded-2xl border border-drift-line bg-white p-5">
              <div className="h-10 w-10 rounded-xl bg-slate-100" />
              <div className="mt-4 h-3 w-2/3 rounded-full bg-slate-100" />
              <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function OrganizationListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading organizations" className="animate-pulse space-y-6">
      <div className="h-3 w-80 max-w-full rounded-full bg-slate-100" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map(item => (
          <div key={item} className="h-48 rounded-2xl border border-drift-line bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded-full bg-slate-100" />
                <div className="h-2.5 w-1/3 rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="h-14 rounded-lg bg-slate-100" />
              <div className="h-14 rounded-lg bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrganizationSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading organization" className="animate-pulse space-y-6">
      <div className="rounded-2xl border border-drift-line bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-slate-100" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-52 rounded-full bg-slate-100" />
            <div className="h-3 w-32 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[0, 1, 2].map(item => (
            <div key={item} className="h-16 rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="h-5 w-28 rounded-full bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map(item => (
          <div key={item} className="h-48 rounded-2xl border border-drift-line bg-white p-5">
            <div className="h-4 w-40 rounded-full bg-slate-100" />
            <div className="mt-5 space-y-3">
              <div className="h-3 w-full rounded-full bg-slate-100" />
              <div className="h-3 w-4/5 rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageError({
  title = "We couldn't load this page",
  message,
  onRetry,
  backHref = '/dashboard/',
  backLabel = 'Back to dashboard',
}: {
  title?: string;
  message: string;
  onRetry: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-drift-line bg-white px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
        <AlertIcon />
      </span>
      <h2 className="mt-4 text-base font-semibold text-drift-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-drift-body">{message}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onRetry} className={PRIMARY_BUTTON}>
          <RefreshIcon className="size-4" />
          Try again
        </button>
        <a href={backHref} className={SECONDARY_BUTTON}>
          {backLabel}
        </a>
      </div>
    </div>
  );
}

export function PageNotFound({
  title,
  message,
  backHref = '/organizations/',
  backLabel = 'Back to organizations',
}: {
  title: string;
  message: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-drift-line bg-white px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-drift-accent-soft text-drift-accent">
        <AlertIcon />
      </span>
      <h2 className="mt-4 text-base font-semibold text-drift-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-drift-body">{message}</p>
      <a href={backHref} className={`mt-6 ${SECONDARY_BUTTON}`}>
        {backLabel}
      </a>
    </div>
  );
}
