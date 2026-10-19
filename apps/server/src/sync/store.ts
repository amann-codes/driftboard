// Storage the sync processor needs. Two implementations:
//   prisma-store.ts -> Postgres (production)
//   memory-store.ts -> in-memory (convergence test)
// Both run the exact same processBatch() logic.
import type { BoardState, CommittedOp, PushResult, Role } from '@driftboard/shared';

export type StoredRejection = { opId: string; boardId: string; actorId: string; clientId: string; type: string; hlc: string; createdAt: number; reason: string };

export interface BoardTx {
  loadState(): Promise<BoardState>;
  getRole(userId: string): Promise<Role | null>;
  memberIds(): Promise<string[]>;
  findResult(opId: string): Promise<PushResult | null>;
  saveRejection(r: StoredRejection): Promise<void>;
  // Persist the new state and the committed ops (only changed rows are written).
  save(prev: BoardState, next: BoardState, ops: CommittedOp[]): Promise<void>;
  opsSince(seq: number, limit: number): Promise<CommittedOp[]>;
}

export interface BoardStore {
  // Runs fn while holding an exclusive lock on the board, so seq numbers never race.
  withBoard<T>(boardId: string, fn: (tx: BoardTx) => Promise<T>): Promise<T>;
}
