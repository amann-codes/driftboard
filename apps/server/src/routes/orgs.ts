// Organizations, members, invite links, projects and boards.
import { Hono } from 'hono';
import { z } from 'zod';
import { SCHEMA_VERSION, formatHlc, sequentialKeys } from '@driftboard/shared';
import { prisma } from '../db';
import { AppEnv, WEB_ORIGIN } from '../auth';
import { processBatch } from '../sync/process';
import { prismaStore } from '../sync/prisma-store';

export async function roleIn(orgId: string, userId: string) {
  const m = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  return m?.role ?? null;
}

const nameBody = z.object({ name: z.string().trim().min(1).max(80) });

export const orgRoutes = new Hono<AppEnv>();

// Who am I and which orgs am I in (with their projects and boards).
orgRoutes.get('/me', async c => {
  const user = c.get('user');
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { org: { include: { projects: { include: { boards: { select: { id: true, name: true } } } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return c.json({
    user,
    orgs: memberships.map(m => ({ id: m.org.id, name: m.org.name, role: m.role, projects: m.org.projects })),
  });
});

orgRoutes.post('/orgs', async c => {
  const body = nameBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Name is required' }, 400);
  const user = c.get('user');
  const org = await prisma.organization.create({
    data: { name: body.data.name, memberships: { create: { userId: user.id, role: 'OWNER' } } },
  });
  return c.json(org);
});

orgRoutes.get('/orgs/:orgId/members', async c => {
  const { orgId } = c.req.param();
  if (!(await roleIn(orgId, c.get('user').id))) return c.json({ error: 'Not a member' }, 403);
  const members = await prisma.membership.findMany({ where: { orgId }, include: { user: { select: { id: true, name: true, email: true } } } });
  return c.json(members.map(m => ({ ...m.user, role: m.role })));
});

// Owner changes someone's role. Takes effect immediately, including for their queued offline ops.
orgRoutes.patch('/orgs/:orgId/members/:userId', async c => {
  const { orgId, userId } = c.req.param();
  if ((await roleIn(orgId, c.get('user').id)) !== 'OWNER') return c.json({ error: 'Only owners can change roles' }, 403);
  const body = z.object({ role: z.enum(['EDITOR', 'VIEWER']) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid role' }, 400);
  await prisma.membership.update({ where: { orgId_userId: { orgId, userId } }, data: { role: body.data.role } });
  return c.json({ ok: true });
});

// ---- invite links ----

orgRoutes.post('/orgs/:orgId/invites', async c => {
  const { orgId } = c.req.param();
  const user = c.get('user');
  if ((await roleIn(orgId, user.id)) !== 'OWNER') return c.json({ error: 'Only owners can invite' }, 403);
  const body = z.object({ role: z.enum(['EDITOR', 'VIEWER']) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Role must be EDITOR or VIEWER' }, 400);
  const invite = await prisma.invite.create({
    data: { orgId, role: body.data.role, createdBy: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  return c.json({ token: invite.id, role: invite.role, url: `${WEB_ORIGIN}/invite/?token=${invite.id}`, expiresAt: invite.expiresAt });
});

orgRoutes.get('/invites/:token', async c => {
  const invite = await prisma.invite.findUnique({ where: { id: c.req.param('token') }, include: { org: true } });
  if (!invite || invite.revoked || invite.expiresAt < new Date()) return c.json({ error: 'Invite link is invalid or expired' }, 404);
  return c.json({ orgName: invite.org.name, role: invite.role });
});

orgRoutes.post('/invites/:token/accept', async c => {
  const user = c.get('user');
  const invite = await prisma.invite.findUnique({ where: { id: c.req.param('token') } });
  if (!invite || invite.revoked || invite.expiresAt < new Date()) return c.json({ error: 'Invite link is invalid or expired' }, 404);
  const existing = await roleIn(invite.orgId, user.id);
  // Accepting an invite never downgrades an existing member (e.g. an owner clicking a viewer link).
  if (!existing) await prisma.membership.create({ data: { orgId: invite.orgId, userId: user.id, role: invite.role } });
  return c.json({ orgId: invite.orgId, role: existing ?? invite.role });
});

// ---- projects and boards ----

orgRoutes.post('/orgs/:orgId/projects', async c => {
  const { orgId } = c.req.param();
  const role = await roleIn(orgId, c.get('user').id);
  if (!role || role === 'VIEWER') return c.json({ error: 'Viewers cannot create projects' }, 403);
  const body = nameBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Name is required' }, 400);
  return c.json(await prisma.project.create({ data: { orgId, name: body.data.name } }));
});

orgRoutes.post('/projects/:projectId/boards', async c => {
  const user = c.get('user');
  const project = await prisma.project.findUnique({ where: { id: c.req.param('projectId') } });
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const role = await roleIn(project.orgId, user.id);
  if (!role || role === 'VIEWER') return c.json({ error: 'Viewers cannot create boards' }, 403);
  const body = nameBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Name is required' }, 400);
  const board = await prisma.board.create({ data: { orgId: project.orgId, projectId: project.id, name: body.data.name } });
  await createColumns(board.id, user.id, ['To do', 'In progress', 'Review', 'Done']);
  return c.json(board);
});

// Default columns go through the normal op pipeline, so they appear in the log like any other change.
export async function createColumns(boardId: string, userId: string, names: string[]) {
  const keys = sequentialKeys(names.length);
  const now = Date.now();
  const ops = names.map((name, i) => ({
    opId: crypto.randomUUID(),
    boardId,
    clientId: 'server',
    hlc: formatHlc(now, i, 'server'),
    createdAt: now,
    v: SCHEMA_VERSION,
    type: 'column.create',
    columnId: crypto.randomUUID(),
    name,
    pos: keys[i],
  }));
  return processBatch(prismaStore, { boardId, userId, sinceSeq: 0, ops });
}
