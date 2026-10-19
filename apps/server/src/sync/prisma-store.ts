import { Prisma } from '@prisma/client';
import type { BoardState, Card, Column, CommittedOp, PushResult, Role } from '@driftboard/shared';
import { prisma } from '../db';
import type { BoardStore, BoardTx, StoredRejection } from './store';
import { SyncError } from './process';

type Tx = Prisma.TransactionClient;

export function toCommittedOp(row: any): CommittedOp {
  return {
    seq: row.seq,
    opId: row.opId,
    boardId: row.boardId,
    actorId: row.actorId,
    clientId: row.clientId,
    hlc: row.hlc,
    createdAt: row.clientCreatedAt.getTime(),
    receivedAt: row.receivedAt.getTime(),
    type: row.type,
    data: row.data,
    applied: row.applied,
    before: row.before ?? undefined,
    conflict: row.conflict ?? undefined,
    notice: row.notice ?? undefined,
  };
}

export async function loadBoardState(db: Tx | typeof prisma, boardId: string): Promise<BoardState> {
  const board = await db.board.findUnique({ where: { id: boardId }, include: { columns: true, cards: true } });
  if (!board) throw new SyncError(404, 'Board not found');
  const columns: Record<string, Column> = {};
  for (const c of board.columns) columns[c.id] = { id: c.id, name: c.name, pos: c.pos, deleted: c.deleted, meta: c.meta as any };
  const cards: Record<string, Card> = {};
  for (const c of board.cards) {
    cards[c.id] = {
      id: c.id,
      columnId: c.columnId,
      pos: c.pos,
      title: c.title,
      description: c.description,
      assigneeId: c.assigneeId,
      labels: c.labels,
      dueDate: c.dueDate,
      archived: c.archived,
      createdBy: c.createdBy,
      meta: c.meta as any,
    };
  }
  return { id: board.id, name: board.name, seq: board.seq, columns, cards };
}

function cardIdsOf(op: CommittedOp): string[] {
  if (op.type === 'column.delete') return op.data.archivedCardIds ?? [];
  if (op.type === 'rebalance') return [];
  return op.data.cardId ? [op.data.cardId] : [];
}

class PrismaBoardTx implements BoardTx {
  constructor(
    private tx: Tx,
    private boardId: string,
    private orgId: string,
  ) {}

  loadState() {
    return loadBoardState(this.tx, this.boardId);
  }

  async getRole(userId: string): Promise<Role | null> {
    const m = await this.tx.membership.findUnique({ where: { orgId_userId: { orgId: this.orgId, userId } } });
    return (m?.role as Role) ?? null;
  }

  async memberIds() {
    const rows = await this.tx.membership.findMany({ where: { orgId: this.orgId }, select: { userId: true } });
    return rows.map(r => r.userId);
  }

  async findResult(opId: string): Promise<PushResult | null> {
    const row = await this.tx.op.findUnique({ where: { opId } });
    if (!row) return null;
    return row.status === 'committed'
      ? { opId, status: 'committed', seq: row.seq ?? undefined }
      : { opId, status: 'rejected', reason: row.reason ?? 'rejected' };
  }

  async saveRejection(r: StoredRejection) {
    await this.tx.op.create({
      data: {
        opId: r.opId,
        boardId: this.boardId,
        status: 'rejected',
        reason: r.reason,
        type: r.type,
        actorId: r.actorId,
        clientId: r.clientId,
        hlc: r.hlc,
        clientCreatedAt: new Date(r.createdAt),
        receivedAt: new Date(),
      },
    });
  }

  async save(prev: BoardState, next: BoardState, ops: CommittedOp[]) {
    // The reducer never mutates, so "object changed" === "row needs writing".
    for (const col of Object.values(next.columns)) {
      if (prev.columns[col.id] === col) continue;
      const data = { name: col.name, pos: col.pos, deleted: col.deleted, meta: col.meta as any };
      await this.tx.column.upsert({ where: { id: col.id }, create: { id: col.id, boardId: this.boardId, ...data }, update: data });
    }
    for (const card of Object.values(next.cards)) {
      if (prev.cards[card.id] === card) continue;
      const data = {
        columnId: card.columnId,
        pos: card.pos,
        title: card.title,
        description: card.description,
        assigneeId: card.assigneeId,
        labels: card.labels,
        dueDate: card.dueDate,
        archived: card.archived,
        meta: card.meta as any,
      };
      await this.tx.card.upsert({
        where: { id: card.id },
        create: { id: card.id, boardId: this.boardId, createdBy: card.createdBy, ...data },
        update: data,
      });
    }
    await this.tx.op.createMany({
      data: ops.map(op => ({
        opId: op.opId,
        boardId: this.boardId,
        seq: op.seq,
        status: 'committed',
        type: op.type,
        actorId: op.actorId,
        clientId: op.clientId,
        hlc: op.hlc,
        data: op.data,
        applied: op.applied,
        before: (op.before ?? Prisma.JsonNull) as any,
        conflict: (op.conflict ?? Prisma.JsonNull) as any,
        notice: op.notice ?? null,
        cardIds: cardIdsOf(op),
        clientCreatedAt: new Date(op.createdAt),
        receivedAt: new Date(op.receivedAt),
      })),
    });
    await this.tx.board.update({ where: { id: this.boardId }, data: { seq: next.seq } });
  }

  async opsSince(seq: number, limit: number) {
    const rows = await this.tx.op.findMany({
      where: { boardId: this.boardId, status: 'committed', seq: { gt: seq } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map(toCommittedOp);
  }
}

export const prismaStore: BoardStore = {
  async withBoard(boardId, fn) {
    return prisma.$transaction(
      async tx => {
        // Row lock: concurrent pushes to the same board queue up here, so seq is gap-free.
        const rows = await tx.$queryRaw<{ orgId: string }[]>`SELECT "orgId" FROM "Board" WHERE id = ${boardId} FOR UPDATE`;
        if (!rows.length) throw new SyncError(404, 'Board not found');
        return fn(new PrismaBoardTx(tx, boardId, rows[0].orgId));
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  },
};
