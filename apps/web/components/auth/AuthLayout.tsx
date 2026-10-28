import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-white text-drift-ink antialiased lg:grid lg:grid-cols-2">
      <section
        aria-label="Driftboard"
        className="relative hidden overflow-hidden bg-[linear-gradient(155deg,#eef1ff_0%,#f5f3ff_52%,#fbfaff_100%)] px-10 py-12 lg:flex lg:flex-col xl:px-16"
      >
        <div aria-hidden className="pointer-events-none absolute -left-28 bottom-8 size-72 rounded-full bg-drift-lilac/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-0 size-72 rounded-full bg-drift-accent-soft blur-3xl" />

        <div className="relative flex items-center gap-2.5 text-lg font-bold tracking-tight text-drift-heading">
          <span className="grid size-8 place-items-center rounded-lg bg-drift-ink text-sm font-bold text-white">D</span>
          Driftboard
        </div>

        <div className="relative mt-16 max-w-md xl:mt-24">
          <h1 className="text-4xl font-semibold leading-[1.06] tracking-[-0.04em] text-drift-heading xl:text-5xl">
            Think together.<br />Build together.
          </h1>
          <p className="mt-5 max-w-sm text-base leading-7 text-drift-body">
            Driftboard helps teams capture ideas, plan work, and move projects forward together.
          </p>
        </div>

        <div aria-hidden className="relative mt-auto h-64 w-full max-w-md pt-10">
          <div className="absolute bottom-0 right-0 w-72 rotate-[-1.5deg] rounded-2xl bg-white p-3 shadow-card ring-1 ring-drift-heading/5">
            <div className="flex gap-1.5 pb-3">
              <span className="size-1.5 rounded-full bg-drift-line" />
              <span className="size-1.5 rounded-full bg-drift-line" />
              <span className="size-1.5 rounded-full bg-drift-line" />
            </div>
            <div className="grid h-40 grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-2 rounded-xl bg-drift-peach p-3">
                <span className="h-1.5 w-3/4 rounded-full bg-drift-ink/20" />
                <span className="h-1.5 w-full rounded-full bg-drift-ink/10" />
                <span className="h-1.5 w-1/2 rounded-full bg-drift-ink/10" />
                <span className="mt-auto h-2.5 w-9 rounded-full bg-drift-ink/15" />
              </div>
              <div className="mt-5 flex flex-col gap-2 rounded-xl bg-drift-mint p-3">
                <span className="h-1.5 w-2/3 rounded-full bg-drift-ink/20" />
                <span className="h-1.5 w-full rounded-full bg-drift-ink/10" />
                <span className="h-1.5 w-4/5 rounded-full bg-drift-ink/10" />
                <span className="mt-auto h-2.5 w-9 rounded-full bg-drift-ink/15" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 left-0 size-20 -rotate-6 rounded-xl bg-drift-lilac shadow-soft" />
          <div className="absolute bottom-0 left-14 size-14 rotate-6 rounded-lg bg-drift-butter shadow-soft" />

          <svg viewBox="0 0 140 80" fill="none" className="absolute left-5 top-0 w-36 text-drift-heading">
            <path
              d="M4 8c30 0 66 8 76 32 6 14-2 26-14 22-10-3-10-16 4-22 22-10 44-10 62 2"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path d="m124 34 10 8-9 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <svg
            viewBox="0 0 24 24"
            className="absolute bottom-20 right-20 w-6 rotate-[-18deg] text-drift-ink drop-shadow-[0_2px_3px_rgba(15,23,42,0.25)]"
          >
            <path d="M5 3l14 7-6 1.6L10 18z" fill="currentColor" />
          </svg>
        </div>
      </section>

      <section className="flex min-h-dvh items-start justify-center px-5 py-10 sm:px-8 lg:items-center lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
