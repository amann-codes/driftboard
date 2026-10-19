// In-memory BoardStore for the convergence test. Same interface as prisma-store.ts.
import type { BoardState, CommittedOp, PushResult, Role } from '@driftboard/shared';
import type { BoardStore, BoardTx } from './store';

export class MemoryStore implements BoardStore {
  state: BoardState;
  log: CommittedOp[] = [];
  results = new Map<string, PushResult>();
  roles = new Map<string, Role>();
  private lock: Promise<unknown> = Promise.resolve();

  constructor(initial: BoardState) {
    this.state = initial;
  }

  withBoard<T>(_boardId: string, fn: (tx: BoardTx) => Promise<T>): Promise<T> {
    const run = this.lock.then(() => fn(this.tx()));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private tx(): BoardTx {
    return {
      loadState: async () => this.state,
      getRole: async userId => this.roles.get(userId) ?? null,
      memberIds: async () => [...this.roles.keys()],
      findResult: async opId => this.results.get(opId) ?? null,
      saveRejection: async r => {
        this.results.set(r.opId, { opId: r.opId, status: 'rejected', reason: r.reason });
      },
      save: async (_prev, next, ops) => {
        this.state = next;
        for (const op of ops) {
          this.log.push(op);
          this.results.set(op.opId, { opId: op.opId, status: 'committed', seq: op.seq });
        }
      },
      opsSince: async (seq, limit) => this.log.filter(op => op.seq > seq).slice(0, limit),
    };
  }
}
