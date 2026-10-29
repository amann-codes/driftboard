// Live integration smoke test for the workspace endpoints.
// Requires the local API and database to be running:
//   npm run test:workspace -w @driftboard/server
// The test creates a temporary user, organization, project, board and invite,
// verifies access scoping, then removes everything it created.
import { prisma } from '../src/db';

const API = process.env.SMOKE_API_URL ?? 'http://localhost:8787';
const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Smoke-${stamp}-Pass!`;
const emails = [
  `workspace.smoke.${stamp}.owner@driftboard.test`,
  `workspace.smoke.${stamp}.other@driftboard.test`,
];
const orgName = `Workspace Smoke ${stamp}`;
let orgId: string | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cookieHeader(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);
  return values
    .map(value => value.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function signUp(name: string, email: string) {
  const response = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  assert(response.ok, `sign-up failed with ${response.status}`);
  const cookie = cookieHeader(response);
  assert(cookie, 'sign-up did not return a session cookie');
  return cookie;
}

async function call<T>(cookie: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T;
  return { response, body };
}

type Organization = {
  id: string;
  name: string;
  role: string;
  projectCount: number;
  boardCount: number;
  memberCount: number;
  projects: { id: string; name: string; boardCount: number }[];
};

type Dashboard = {
  user: { id: string; email: string };
  organizations: Organization[];
  recentBoards: {
    id: string;
    name: string;
    orgId: string;
    orgName: string;
    projectName: string;
    lastActivityAt: string;
  }[];
  totals: { organizations: number; projects: number; boards: number };
};

type OrgDetail = Organization & {
  projects: { id: string; name: string; boards: { id: string; name: string; lastActivityAt: string }[] }[];
};

async function main() {
  const ownerCookie = await signUp('Workspace Smoke Owner', emails[0]);
  const otherCookie = await signUp('Workspace Smoke Other', emails[1]);

  const empty = await call<Dashboard>(ownerCookie, '/api/dashboard');
  assert(empty.response.status === 200, 'dashboard should load for a new user');
  assert(empty.body.organizations.length === 0, 'new user should have no organizations');
  assert(empty.body.recentBoards.length === 0, 'new user should have no recent boards');

  const createdOrg = await call<{ id: string; name: string }>(ownerCookie, '/api/orgs', {
    method: 'POST',
    body: JSON.stringify({ name: orgName }),
  });
  assert(createdOrg.response.status === 200, 'organization creation should succeed');
  orgId = createdOrg.body.id;
  assert(orgId, 'organization creation should return an id');

  const createdProject = await call<{ id: string; name: string }>(ownerCookie, `/api/orgs/${orgId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Smoke Project' }),
  });
  assert(createdProject.response.status === 200, 'project creation should succeed');

  const createdBoard = await call<{ id: string; name: string }>(ownerCookie, `/api/projects/${createdProject.body.id}/boards`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Smoke Board' }),
  });
  assert(createdBoard.response.status === 200, 'board creation should succeed');

  const dashboard = await call<Dashboard>(ownerCookie, '/api/dashboard');
  const org = dashboard.body.organizations.find(item => item.id === orgId);
  assert(org, 'dashboard should include the created organization');
  assert(org.role === 'OWNER', 'creator should be an owner');
  assert(org.projectCount === 1 && org.boardCount === 1 && org.memberCount === 1, 'organization counts should be accurate');
  assert(org.projects[0]?.boardCount === 1, 'project board count should be accurate');

  const recent = dashboard.body.recentBoards.find(board => board.id === createdBoard.body.id);
  assert(recent, 'dashboard should include the created board');
  assert(recent.orgName === orgName && recent.projectName === 'Smoke Project', 'recent board context should be accurate');
  assert(Number.isFinite(Date.parse(recent.lastActivityAt)), 'recent board should have a real activity timestamp');
  assert(dashboard.body.totals.organizations === 1 && dashboard.body.totals.boards === 1, 'workspace totals should be accurate');

  const list = await call<{ organizations: Organization[] }>(ownerCookie, '/api/orgs');
  assert(list.response.status === 200 && list.body.organizations.some(item => item.id === orgId), 'organization list should include the org');

  const detail = await call<OrgDetail>(ownerCookie, `/api/orgs/${orgId}`);
  assert(detail.response.status === 200, 'organization detail should load for a member');
  assert(detail.body.projects[0]?.boards[0]?.id === createdBoard.body.id, 'organization detail should include the board');
  assert(Number.isFinite(Date.parse(detail.body.projects[0].boards[0].lastActivityAt)), 'board detail should have a real activity timestamp');

  const otherDashboard = await call<Dashboard>(otherCookie, '/api/dashboard');
  assert(otherDashboard.body.organizations.length === 0, 'other user should not see the organization');
  const otherDetail = await call(otherCookie, `/api/orgs/${orgId}`);
  assert(otherDetail.response.status === 404, 'other user should not read organization detail');
  const otherBoard = await call(otherCookie, `/api/boards/${createdBoard.body.id}`);
  assert(otherBoard.response.status === 404, 'other user should not read the board');

  const invite = await call<{ url: string; role: string; expiresAt: string }>(ownerCookie, `/api/orgs/${orgId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ role: 'EDITOR' }),
  });
  assert(invite.response.status === 200 && invite.body.role === 'EDITOR', 'owner invite creation should succeed');
  assert(new URL(invite.body.url).origin === new URL(WEB).origin, 'invite URL should use the configured web origin');

  const invalidInvite = await call(ownerCookie, `/api/orgs/${orgId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ role: 'OWNER' }),
  });
  assert(invalidInvite.response.status === 400, 'owner invites should be rejected');

  const otherInvite = await call(otherCookie, `/api/orgs/${orgId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ role: 'EDITOR' }),
  });
  assert(otherInvite.response.status === 403, 'non-owner invites should be forbidden');

  console.log('PASS: dashboard, organization scoping, counts, activity, and invites');
}

main()
  .catch(error => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });
