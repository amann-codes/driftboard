import { FOCUS_RING } from './styles';

export function BrandMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-drift-ink text-sm font-bold text-white" aria-hidden>
      D
    </span>
  );
}

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/dashboard/"
      aria-label="Driftboard dashboard"
      className={`inline-flex items-center gap-2.5 rounded-lg text-lg font-bold tracking-tight text-drift-heading no-underline ${FOCUS_RING}`}
    >
      <BrandMark />
      {!compact && <span>Driftboard</span>}
    </a>
  );
}
