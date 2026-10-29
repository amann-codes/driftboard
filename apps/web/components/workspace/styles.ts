export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-accent focus-visible:ring-offset-2';

export const PRIMARY_BUTTON = `inline-flex h-10 items-center justify-center gap-2 rounded-lg border-0 bg-drift-accent px-4 text-sm font-medium text-white shadow-sm transition hover:bg-drift-accent-hover disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const SECONDARY_BUTTON = `inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-drift-line bg-white px-4 text-sm font-medium text-drift-ink transition hover:bg-drift-surface disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const GHOST_BUTTON = `inline-flex h-9 items-center justify-center gap-2 rounded-lg border-0 bg-transparent px-3 text-sm font-medium text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`;

export const DANGER_BUTTON = `inline-flex h-9 items-center justify-center gap-2 rounded-lg border-0 bg-transparent px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 ${FOCUS_RING}`;

export const ICON_BUTTON = `grid size-10 place-items-center rounded-lg border border-transparent bg-transparent text-drift-muted transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`;

export const INPUT = `h-11 w-full rounded-lg border border-drift-line bg-white px-3.5 text-sm text-drift-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20`;

export const INPUT_ERROR = 'border-red-400 focus:border-red-500 focus:ring-red-200/60';

export const FIELD_LABEL = 'block text-sm font-medium text-drift-ink';

export const CARD = 'rounded-2xl border border-drift-line bg-white shadow-sm';

export const CARD_HOVER = 'transition hover:border-slate-300 hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)]';
