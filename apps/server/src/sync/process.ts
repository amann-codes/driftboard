// POST /api/boards/:id/sync lands here.
// Input: the client's pending ops (in the order the user made them) + the last seq it has.
// Output: a result per op + every committed op after that seq (so push and pull are one round trip).
import { BoardState, CommittedOp, OpSchema, PushResult, commit, formatHlc, parseHlc, upcast } from '@driftboard/shared';
import type { BoardStore } from './store';

export const MAX_OPS_PER_REQUEST = 100;
// If a client is further behind than this, send a snapshot instead of the whole log.
export const RESET_THRESHOLD = 1000;
// An op stamped further in the future than this is clamped (broken device clock).
const MAX_CLOCK_SKEW_MS = 60_000;

export class SyncError extends Error {
  constructor(
    public status: 401 | 403 | 404 | 400,
    message: string,
  ) {
    super(message);
  }
}

export type SyncInput = { boardId: string; userId: string; sinceSeq: number; ops: unknown[]; now?: number };
export type SyncOutput = { results: PushResult[]; ops: CommittedOp[]; reset?: BoardState; committed: CommittedOp[] };

export async function processBatch(store: BoardStore, input: SyncInput): Promise<SyncOutput> {
  if (!Array.isArray(input.ops) || input.ops.length > MAX_OPS_PER_REQUEST) throw new SyncError(400, 'Too many ops in one request');

  return store.withBoard(input.boardId, async tx => {
    // Permission is checked per request AND per op below; an op queued offline by a
    // user who has since been downgraded to Viewer is rejected here when it arrives.
    const role = await tx.getRole(input.userId);
    if (!role) throw new SyncError(403, 'You are not a member of this board’s organization');
    const memberIds = await tx.memberIds();

    const prev = await tx.loadState();
    let state = prev;
    const committed: CommittedOp[] = [];
    const results: PushResult[] = [];
    const seenInBatch = new Map<string, PushResult>();

    for (const raw of input.ops) {
      const opId = typeof (raw as any)?.opId === 'string' ? (raw as any).opId : '';

      // 1) Exactly-once: if we have seen this opId before, return the stored result.
      const prior = seenInBatch.get(opId) ?? (opId ? await tx.findResult(opId) : null);
      if (prior) {
        results.push({ ...prior, duplicate: true });
        continue;
      }

      // 2) Well-formed? (after migrating ops queued by older app versions)
      let parsed;
      try {
        parsed = OpSchema.safeParse(upcast(raw));
      } catch (e) {
        results.push({ opId, status: 'rejected', reason: 'App version is newer than the server; please wait for the update' });
        continue;
      }
      if (!parsed.success) {
        const reason = `Malformed change: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
        const r: PushResult = { opId, status: 'rejected', reason };
        results.push(r);
        continue;
      }
      const op = parsed.data;
      const now = input.now ?? Date.now();

      // 3) Clamp clocks that are way in the future so one bad device can't win every conflict.
      const h = parseHlc(op.hlc);
      if (h.ms > now + MAX_CLOCK_SKEW_MS) op.hlc = formatHlc(now, h.counter, h.node);

      // 4) Business rules (permissions, card exists, conflicts, placement).
      const r = commit(state, op, { actorId: input.userId, role, nextSeq: state.seq + 1, now, memberIds });
      if (!r.ok) {
        const rej: PushResult = { opId, status: 'rejected', reason: r.reason };
        await tx.saveRejection({
          opId,
          boardId: op.boardId,
          actorId: input.userId,
          clientId: op.clientId,
          type: op.type,
          hlc: op.hlc,
          createdAt: op.createdAt,
          reason: r.reason,
        });
        seenInBatch.set(opId, rej);
        results.push(rej);
        continue;
      }
      state = r.state;
      committed.push(...r.ops);
      const mine = r.ops.find(c => c.opId === opId)!;
      const ok: PushResult = { opId, status: 'committed', seq: mine.seq };
      seenInBatch.set(opId, ok);
      results.push(ok);
    }

    if (committed.length) await tx.save(prev, state, committed);

    // 5) Piggy-back the pull.
    if (state.seq - input.sinceSeq > RESET_THRESHOLD || input.sinceSeq > state.seq) {
      return { results, ops: [], reset: state, committed };
    }
    const ops = await tx.opsSince(input.sinceSeq, RESET_THRESHOLD);
    return { results, ops, committed };
  });
}
