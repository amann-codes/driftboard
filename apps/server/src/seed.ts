// Seed data. Users are created THROUGH Better Auth (auth.api.signUpEmail), not inserted by hand.
// Safe to run more than once: it skips anything that already exists.
import { SCHEMA_VERSION, formatHlc, sequentialKeys } from '@driftboard/shared';
import { auth } from './auth';
import { prisma } from './db';
import { createColumns } from './routes/orgs';
import { processBatch } from './sync/process';
import { prismaStore } from './sync/prisma-store';

const PASSWORD = 'Driftboard123!';

const USERS = [
  { key: 'owner', name: 'Olivia Owner', email: 'owner@driftboard.dev' },
  { key: 'editor', name: 'Eddie Editor', email: 'editor@driftboard.dev' },
  { key: 'viewer', name: 'Vera Viewer', email: 'viewer@driftboard.dev' },
  { key: 'riya', name: 'Riya Shah', email: 'riya@northwind.dev' },
  { key: 'kabir', name: 'Kabir Rao', email: 'kabir@northwind.dev' },
] as const;

async function ensureUser(name: string, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing.id;
  const res = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  return res.user.id;
}

async function ensureOrg(name: string, members: { userId: string; role: 'OWNER' | 'EDITOR' | 'VIEWER' }[]) {
  let org = await prisma.organization.findFirst({ where: { name } });
  if (!org) org = await prisma.organization.create({ data: { name } });
  for (const m of members) {
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: m.userId } },
      create: { orgId: org.id, userId: m.userId, role: m.role },
      update: {},
    });
  }
  return org;
}

async function ensureBoard(orgId: string, ownerId: string, projectName: string, boardName: string, cards: [string, string, string][]) {
  const existing = await prisma.board.findFirst({ where: { orgId, name: boardName } });
  if (existing) return existing;
  const project = await prisma.project.create({ data: { orgId, name: projectName } });
  const board = await prisma.board.create({ data: { orgId, projectId: project.id, name: boardName } });
  await createColumns(board.id, ownerId, ['To do', 'In progress', 'Review', 'Done']);

  // Cards go through the op pipeline too, so they get history like real edits.
  const cols = await prisma.column.findMany({ where: { boardId: board.id } });
  const colByName = Object.fromEntries(cols.map(c => [c.name, c.id]));
  const now = Date.now();
  let counter = 100;
  const op = (fields: Record<string, unknown>) => ({
    opId: crypto.randomUUID(),
    boardId: board.id,
    clientId: 'seed',
    hlc: formatHlc(now, counter++, 'seed'),
    createdAt: now,
    v: SCHEMA_VERSION,
    ...fields,
  });
  const ops: unknown[] = [];
  const perColumn: Record<string, number> = {};
  for (const [column, title, description] of cards) {
    const idx = perColumn[column] ?? 0;
    perColumn[column] = idx + 1;
    const cardId = crypto.randomUUID();
    ops.push(op({ type: 'card.create', cardId, columnId: colByName[column], pos: sequentialKeys(idx + 1)[idx], afterId: null, beforeId: null, title }));
    if (description) ops.push(op({ type: 'card.set', cardId, field: 'description', value: description, base: null }));
  }
  await processBatch(prismaStore, { boardId: board.id, userId: ownerId, sinceSeq: 0, ops });
  return board;
}

const SAMPLE_MD = `## Goal
Ship the new **pricing page** before the client review.

- [x] Gather copy from marketing
- [ ] Final design pass
- [ ] Hand off to dev

| Plan | Price |
| ---- | ----- |
| Solo | $9    |
| Team | $29   |

\`\`\`css
.price { font-weight: 700; }
\`\`\`

See [the brief](https://example.com/brief).`;

async function main() {
  const ids: Record<string, string> = {};
  for (const u of USERS) ids[u.key] = await ensureUser(u.name, u.email);

  const acme = await ensureOrg('Acme Design Studio', [
    { userId: ids.owner, role: 'OWNER' },
    { userId: ids.editor, role: 'EDITOR' },
    { userId: ids.viewer, role: 'VIEWER' },
    { userId: ids.riya, role: 'EDITOR' },
    { userId: ids.kabir, role: 'EDITOR' },
  ]);
  const northwind = await ensureOrg('Northwind Creative', [
    { userId: ids.riya, role: 'OWNER' },
    { userId: ids.kabir, role: 'EDITOR' },
    { userId: ids.editor, role: 'VIEWER' }, // same person, different role in another org
  ]);

  await ensureBoard(acme.id, ids.owner, 'Client: Lumen', 'Lumen website', [
    ['To do', 'Fix login redirect', ''],
    ['To do', 'Write onboarding copy', ''],
    ['In progress', 'Update pricing page', SAMPLE_MD],
    ['Review', 'Book user interviews', 'Five interviews, 30 min each.'],
    ['Done', 'Kickoff call', ''],
  ]);
  await ensureBoard(northwind.id, ids.riya, 'Internal', 'Studio ops', [
    ['To do', 'Renew font licences', ''],
    ['In progress', 'Hire a motion designer', '- [ ] Post job\n- [ ] Shortlist'],
  ]);

  console.log('Seed complete. Password for every user:', PASSWORD);
  for (const u of USERS) console.log(`  ${u.email}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
