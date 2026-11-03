import type { DashboardData } from './workspace';

export const DASHBOARD_CACHE_KEY = 'driftboard.dashboard';

function isDashboardData(value: unknown): value is DashboardData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<DashboardData>;
  const validRole = (role: unknown) => role === 'OWNER' || role === 'EDITOR' || role === 'VIEWER';
  const validOrganizations =
    Array.isArray(data.organizations) &&
    data.organizations.every(
      organization =>
        Boolean(
          organization &&
            typeof organization.id === 'string' &&
            typeof organization.name === 'string' &&
            validRole(organization.role) &&
            typeof organization.projectCount === 'number' &&
            typeof organization.boardCount === 'number' &&
            typeof organization.memberCount === 'number' &&
            Array.isArray(organization.projects) &&
            organization.projects.every(
              project => project && typeof project.id === 'string' && typeof project.name === 'string' && typeof project.boardCount === 'number',
            ),
        ),
    );
  const validRecentBoards =
    Array.isArray(data.recentBoards) &&
    data.recentBoards.every(
      board =>
        Boolean(
          board &&
            typeof board.id === 'string' &&
            typeof board.name === 'string' &&
            typeof board.orgName === 'string' &&
            typeof board.projectName === 'string' &&
            typeof board.lastActivityAt === 'string',
        ),
    );
  return (
    Boolean(
      data.user &&
        typeof data.user.id === 'string' &&
        typeof data.user.name === 'string' &&
        typeof data.user.email === 'string',
    ) &&
    validOrganizations &&
    validRecentBoards &&
    Boolean(
      data.totals &&
        typeof data.totals.organizations === 'number' &&
        typeof data.totals.projects === 'number' &&
        typeof data.totals.boards === 'number',
    )
  );
}

export function cachedDashboard(): DashboardData | null {
  try {
    const value = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) ?? 'null');
    return isDashboardData(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveDashboardCache(data: DashboardData) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch {
    // A full or unavailable localStorage should not break the online dashboard.
  }
}

export function clearWorkspaceCache() {
  try {
    localStorage.removeItem('driftboard.me');
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
  } catch {
    // Storage can be unavailable; signing out should still proceed.
  }
}
