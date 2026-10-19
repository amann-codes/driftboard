// Client-side sync logic. No React, no IndexedDB, no fetch: those are injected,
// so the same class runs in the browser and in the convergence test.
//
//   confirmed = server's state, built ONLY from CommittedOps applied in seq order
//   pending   = my ops the server hasn't confirmed yet (the outbox, in the order I made them)
//   view      = confirmed + pending replayed through commit()  -> what the UI shows
import { BoardState, Role, applyCommitted, commit } from './engine';
import { HlcClock } from './hlc';
import { ClientOp, CommittedOp, Conflict, OpInput, PushResult, SCHEMA_VERSION } from './ops';

export type SyncRequest = { sinceSeq: number; ops: ClientOp[] };
export type SyncResponse = { results: PushResult[]; ops: CommittedOp[]; reset?: BoardState };
export type Transport = (req: SyncRequest) => Promise<SyncResponse>;

export type LostEdit = Conflict & { seq: number; cardId?: string; columnId?: string; at: number };

export type Notice = { kind: 'rejected' | 'conflict' | 'info'; message: string };

export type ClientSnapshot = { confirmed: BoardState; pending: ClientOp[]; lostEdits: LostEdit[] };

export type SyncClientOptions = {
  actorId: string;
  clientId: string;
  role: Role;
  memberIds: string[];
  snapshot: ClientSnapshot;
  transport: Transport;
  persist?: (snap: ClientSnapshot) => void;
  onChange?: () => void;
  onNotice?: (n: Notice) => void;
  now?: () => number;
  batchSize?: number;
};

const NOTICE_TEXT: Record<string, string> = {
  card_archived: 'This card was archived by someone else. Your change was saved on the archived card; restore it to bring it back.',
  column_deleted_redirected: 'That column was deleted, so your new card was added to the first column instead.',
  column_restored: 'That column had been deleted, so restoring this card brought the column back with it.',
};

export class SyncClient {
  confirmed: BoardState;
  pending: ClientOp[];
  lostEdits: LostEdit[];
  view!: BoardState;
  online = true;
  readonly sending = new Set<string>();
  readonly clock: HlcClock;

  private flushing = false;
  private flushAgain = false;

  constructor(private readonly o: SyncClientOptions) {
    this.confirmed = o.snapshot.confirmed;
    this.pending = o.snapshot.pending;
    this.lostEdits = o.snapshot.lostEdits;
    this.clock = new HlcClock(o.clientId, o.now);
    // After a reload, never stamp anything older than what we already made.
    this.pending.forEach(p => this.clock.observe(p.hlc));
    this.recompute();
  }

  get actorId() {
    return this.o.actorId;
  }

  setRole(role: Role, memberIds: string[]) {
    this.o.role = role;
    this.o.memberIds = memberIds;
    this.recompute();
    this.changed();
  }

  // ---- making changes ----

  act(input: OpInput): ClientOp {
    const op = {
      ...input,
      opId: crypto.randomUUID(),
      boardId: this.confirmed.id,
      clientId: this.o.clientId,
      hlc: this.clock.tick(),
      createdAt: (this.o.now ?? Date.now)(),
      v: SCHEMA_VERSION,
      base: this.baseFor(input),
    } as ClientOp;
    if (op.type === 'column.create' || op.type === 'column.delete' || op.type === 'card.create') delete (op as any).base;
    this.pending = [...this.pending, op];
    this.recompute();
    this.save();
    this.changed();
    void this.flush();
    return op;
  }

  // The HLC of the field as I see it right now (see `base` in ops.ts).
  private baseFor(input: OpInput): string | null {
    const v = this.view;
    switch (input.type) {
      case 'card.set':
        return v.cards[input.cardId]?.meta[input.field]?.hlc ?? null;
      case 'card.label':
        return v.cards[input.cardId]?.meta[`label:${input.label}`]?.hlc ?? null;
      case 'card.move':
        return v.cards[input.cardId]?.meta.position?.hlc ?? null;
      case 'column.rename':
        return v.columns[input.columnId]?.meta.name?.hlc ?? null;
      case 'column.move':
        return v.columns[input.columnId]?.meta.position?.hlc ?? null;
      default:
        return null;
    }
  }

  // ---- talking to the server ----

  setOnline(online: boolean) {
    this.online = online;
    this.changed();
    if (online) void this.flush();
  }

  // Sends pending ops (oldest first, one batch in flight at a time) and pulls
  // everything the server committed since our last seq. Safe to call any time.
  async flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    this.flushing = true;
    try {
      let more = true;
      while (more && this.online) {
        this.flushAgain = false;
        const batch = this.pending.slice(0, this.o.batchSize ?? 50);
        batch.forEach(op => this.sending.add(op.opId));
        this.changed();
        let res: SyncResponse;
        try {
          res = await this.o.transport({ sinceSeq: this.confirmed.seq, ops: batch });
        } catch {
          // Network dropped (maybe after the server applied them). The ops stay
          // pending and are re-sent later with the same opId; the server dedupes.
          this.sending.clear();
          this.changed();
          return;
        }
        this.sending.clear();
        this.handleResponse(res);
        more = (batch.length > 0 && this.pending.length > 0) || this.flushAgain;
      }
    } finally {
      this.flushing = false;
    }
  }

  private handleResponse(res: SyncResponse) {
    if (res.reset) {
      // We were too far behind; the server sent a fresh snapshot instead of the full log.
      this.confirmed = res.reset;
    }
    this.applyOps(res.ops);
    for (const r of res.results) {
      if (r.status === 'rejected') {
        const op = this.pending.find(p => p.opId === r.opId);
        this.pending = this.pending.filter(p => p.opId !== r.opId);
        if (op && !r.duplicate) this.notify('rejected', `${describeOp(op, this.view)} was rejected: ${r.reason}`);
      } else if (r.seq !== undefined && r.seq <= this.confirmed.seq) {
        this.pending = this.pending.filter(p => p.opId !== r.opId);
      }
    }
    this.recompute();
    this.save();
    this.changed();
  }

  // Live ops pushed over the WebSocket.
  receive(ops: CommittedOp[]) {
    const gap = this.applyOps(ops);
    this.recompute();
    this.save();
    this.changed();
    if (gap) void this.flush(); // a flush with no ops is a pull
  }

  // Applies ops strictly in seq order. Returns true if we noticed a gap.
  private applyOps(ops: CommittedOp[]): boolean {
    const sorted = [...ops].sort((a, b) => a.seq - b.seq);
    for (const op of sorted) {
      if (op.seq <= this.confirmed.seq) continue; // already have it
      if (op.seq !== this.confirmed.seq + 1) return true; // missed something; pull
      this.confirmed = applyCommitted(this.confirmed, op);
      this.clock.observe(op.hlc);
      this.pending = this.pending.filter(p => p.opId !== op.opId);
      this.noticeFor(op);
    }
    return false;
  }

  private noticeFor(op: CommittedOp) {
    const me = this.o.actorId;
    if (op.conflict && op.conflict.loserId === me) {
      this.lostEdits = [
        ...this.lostEdits.filter(l => l.seq !== op.seq),
        { ...op.conflict, seq: op.seq, cardId: op.data.cardId, columnId: op.data.columnId, at: op.receivedAt },
      ].slice(-100);
      this.notify('conflict', `Your ${prettyField(op.conflict.field)} edit was replaced by a newer edit. Your version is kept on the card.`);
    }
    if (op.notice && op.actorId === me && op.clientId === this.o.clientId) {
      this.notify('info', NOTICE_TEXT[op.notice] ?? op.notice);
    }
  }

  dismissLostEdit(seq: number) {
    this.lostEdits = this.lostEdits.filter(l => l.seq !== seq);
    this.save();
    this.changed();
  }

  // ---- internals ----

  private recompute() {
    let v = this.confirmed;
    for (const op of this.pending) {
      const r = commit(v, op, {
        actorId: this.o.actorId,
        role: this.o.role,
        nextSeq: v.seq + 1,
        now: Date.now(),
        memberIds: this.o.memberIds,
      });
      if (r.ok) v = r.state;
    }
    this.view = v;
  }

  snapshot(): ClientSnapshot {
    return { confirmed: this.confirmed, pending: this.pending, lostEdits: this.lostEdits };
  }

  private save() {
    this.o.persist?.(this.snapshot());
  }

  private changed() {
    this.o.onChange?.();
  }

  private notify(kind: Notice['kind'], message: string) {
    this.o.onNotice?.({ kind, message });
  }
}

// ---- text helpers for the UI ----

export function prettyField(key: string): string {
  if (key.startsWith('label:')) return `label "${key.slice(6)}"`;
  return ({ assigneeId: 'assignee', dueDate: 'due date', position: 'position' } as Record<string, string>)[key] ?? key;
}

export function describeOp(op: ClientOp, s: BoardState): string {
  const cardTitle = (id: string) => `"${s.cards[id]?.title ?? 'card'}"`;
  const colName = (id: string) => `"${s.columns[id]?.name ?? 'column'}"`;
  switch (op.type) {
    case 'card.create':
      return `Create card "${op.title}"`;
    case 'card.set':
      if (op.field === 'archived') return `${op.value ? 'Archive' : 'Restore'} ${cardTitle(op.cardId)}`;
      return `Edit ${prettyField(op.field)} of ${cardTitle(op.cardId)}`;
    case 'card.label':
      return `${op.on ? 'Add' : 'Remove'} label "${op.label}" on ${cardTitle(op.cardId)}`;
    case 'card.move':
      return `Move ${cardTitle(op.cardId)} to ${colName(op.columnId)}`;
    case 'column.create':
      return `Create column "${op.name}"`;
    case 'column.rename':
      return `Rename column to "${op.name}"`;
    case 'column.move':
      return `Reorder column ${colName(op.columnId)}`;
    case 'column.delete':
      return `Delete column ${colName(op.columnId)}`;
  }
}
