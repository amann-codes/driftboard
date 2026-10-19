// Board snapshot, the sync endpoint, and card history.
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db';
import { AppEnv } from '../auth';
import { broadcastOps } from '../realtime';
import { SyncError, processBatch } from '../sync/process';
import { loadBoardState, prismaStore, toCommittedOp } from '../sync/prisma-store';
import { roleIn } from './orgs';

export const boardRoutes = new Hono<AppEnv>();

async function boardAccess(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { orgId: true } });
  if (!board) return null;
  const role = await roleIn(board.orgId, userId);
  return role ? { orgId: board.orgId, role } : null;
}

// Full current state. The client caches it in IndexedDB for offline use.
boardRoutes.get('/boards/:boardId', async c => {
  const { boardId } = c.req.param();
  const access = await boardAccess(boardId, c.get('user').id);
  if (!access) return c.json({ error: 'Board not found' }, 404);
  const [state, members] = await Promise.all([
    loadBoardState(prisma, boardId),
    prisma.membership.findMany({ where: { orgId: access.orgId }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  return c.json({ state, role: access.role, orgId: access.orgId, members: members.map(m => ({ id: m.user.id, name: m.user.name, role: m.role })) });
});

const syncBody = z.object({ sinceSeq: z.number().int().min(0), ops: z.array(z.unknown()).max(100) });

// Push pending ops + pull everything newer than sinceSeq, in one request.
boardRoutes.post('/boards/:boardId/sync', async c => {
  const body = syncBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Bad sync request' }, 400);
  try {
    const out = await processBatch(prismaStore, {
      boardId: c.req.param('boardId'),
      userId: c.get('user').id,
      sinceSeq: body.data.sinceSeq,
      ops: body.data.ops,
    });
    broadcastOps(c.req.param('boardId'), out.committed); // everyone else sees it within ~1s
    return c.json({ results: out.results, ops: out.ops, reset: out.reset });
  } catch (e) {
    if (e instanceof SyncError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

// Activity log for one card: who changed what, from what, to what, when made and when received.
boardRoutes.get('/boards/:boardId/cards/:cardId/history', async c => {
  const { boardId, cardId } = c.req.param();
  if (!(await boardAccess(boardId, c.get('user').id))) return c.json({ error: 'Board not found' }, 404);
  const rows = await prisma.op.findMany({
    where: { boardId, status: 'committed', cardIds: { has: cardId } },
    orderBy: { seq: 'asc' },
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map(r => r.actorId))] } }, select: { id: true, name: true } });
  const names = Object.fromEntries(users.map(u => [u.id, u.name]));
  return c.json(rows.map(r => ({ ...toCommittedOp(r), actorName: names[r.actorId] ?? 'Unknown' })));
});
