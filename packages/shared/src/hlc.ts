// Hybrid Logical Clock. Format: "<15-digit ms>:<6-digit counter>:<nodeId>".
// Comparing two HLC strings with < gives a total order:
// - mostly follows wall time,
// - but once you have SEEN an edit, your next edit is always ordered after it,
//   even if your own clock is behind,
// - the nodeId breaks exact ties, so two different clients never produce equal stamps.

export type Hlc = string;

export const HLC_PATTERN = /^\d{15}:\d{6}:[A-Za-z0-9_-]{1,64}$/;

export function formatHlc(ms: number, counter: number, node: string): Hlc {
  return `${String(ms).padStart(15, '0')}:${String(counter).padStart(6, '0')}:${node}`;
}

export function parseHlc(h: Hlc): { ms: number; counter: number; node: string } {
  const [ms, counter, node] = h.split(':');
  return { ms: Number(ms), counter: Number(counter), node };
}

export class HlcClock {
  private ms = 0;
  private counter = 0;

  constructor(
    public readonly node: string,
    private readonly now: () => number = Date.now,
  ) {}

  // Stamp a new local event.
  tick(): Hlc {
    const t = this.now();
    if (t > this.ms) {
      this.ms = t;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return formatHlc(this.ms, this.counter, this.node);
  }

  // Remember a stamp we received, so our next tick() is ordered after it.
  observe(remote: Hlc): void {
    const r = parseHlc(remote);
    if (r.ms > this.ms || (r.ms === this.ms && r.counter > this.counter)) {
      this.ms = r.ms;
      this.counter = r.counter;
    }
  }
}
