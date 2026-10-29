// Dashboard and organization overview data. Every query is scoped to the
// signed-in user's memberships, so an organization id from another account can
// never be used to read its projects or boards.
import { Hono } from 'hono';
import { AppEnv } from '../auth';
import { prisma } from '../db';

export const workspaceRoutes = new Hono<AppEnv>();

const later = (createdAt: Date, activity: Date | null | undefined) =>
  activity && activity > createdAt ? activity : createdAt;

async function boardActivity(boardIds: string[]) {
  if (boardIds.length === 0) return new Map<string, Date>();
  const rows = await prisma.op.groupBy({
    by: ['boardId'],
    where: { boardId: { in: boardIds }, status: 'committed' },
    _max: { receivedAt: true },
  });
  return new Map(rows.map(row => [row.boardId, row._max.receivedAt]));
}

async function organizationsForUser(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      role: true,
      org: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { projects: true, boards: true, memberships: true } },
          projects: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              _count: { select: { boards: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map(({ role, org }) => ({
    id: org.id,
    name: org.name,
    role,
    createdAt: org.createdAt,
    projectCount: org._count.projects,
    boardCount: org._count.boards,
    memberCount: org._count.memberships,
    projects: org.projects.map(project => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      boardCount: project._count.boards,
    })),
  }));
}

workspaceRoutes.get('/dashboard', async c => {
  const user = c.get('user');
  const organizations = await organizationsForUser(user.id);
  const boards = await prisma.board.findMany({
    where: { org: { memberships: { some: { userId: user.id } } } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      org: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
  const activity = await boardActivity(boards.map(board => board.id));
  const recentBoards = boards
    .map(board => ({
      id: board.id,
      name: board.name,
      orgId: board.org.id,
      orgName: board.org.name,
      projectId: board.project.id,
      projectName: board.project.name,
      createdAt: board.createdAt,
      lastActivityAt: later(board.createdAt, activity.get(board.id)),
    }))
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
    .slice(0, 6);

  return c.json({
    user,
    organizations,
    recentBoards,
    totals: {
      organizations: organizations.length,
      projects: organizations.reduce((sum, org) => sum + org.projectCount, 0),
      boards: organizations.reduce((sum, org) => sum + org.boardCount, 0),
    },
  });
});

workspaceRoutes.get('/orgs', async c => {
  const user = c.get('user');
  return c.json({ user, organizations: await organizationsForUser(user.id) });
});

workspaceRoutes.get('/orgs/:orgId', async c => {
  const user = c.get('user');
  const { orgId } = c.req.param();
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: user.id } },
    select: {
      role: true,
      org: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { projects: true, boards: true, memberships: true } },
          projects: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              _count: { select: { boards: true } },
              boards: {
                select: { id: true, name: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!membership) return c.json({ error: 'Organization not found' }, 404);

  const boardIds = membership.org.projects.flatMap(project => project.boards.map(board => board.id));
  const activity = await boardActivity(boardIds);

  return c.json({
    user,
    id: membership.org.id,
    name: membership.org.name,
    role: membership.role,
    createdAt: membership.org.createdAt,
    projectCount: membership.org._count.projects,
    boardCount: membership.org._count.boards,
    memberCount: membership.org._count.memberships,
    projects: membership.org.projects.map(project => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      boardCount: project._count.boards,
      boards: project.boards.map(board => ({
        id: board.id,
        name: board.name,
        createdAt: board.createdAt,
        lastActivityAt: later(board.createdAt, activity.get(board.id)),
      })),
    })),
  });
});
