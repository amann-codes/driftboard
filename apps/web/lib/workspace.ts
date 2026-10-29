import { ApiError } from './api';

export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  boardCount: number;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
  projectCount: number;
  boardCount: number;
  memberCount: number;
  projects: ProjectSummary[];
};

export type RecentBoard = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  lastActivityAt: string;
};

export type DashboardData = {
  user: WorkspaceUser;
  organizations: OrganizationSummary[];
  recentBoards: RecentBoard[];
  totals: {
    organizations: number;
    projects: number;
    boards: number;
  };
};

export type OrgListData = {
  user: WorkspaceUser;
  organizations: OrganizationSummary[];
};

export type OrgBoard = {
  id: string;
  name: string;
  createdAt: string;
  lastActivityAt: string;
};

export type OrgProject = {
  id: string;
  name: string;
  createdAt: string;
  boardCount: number;
  boards: OrgBoard[];
};

export type OrgDetail = {
  user: WorkspaceUser;
  id: string;
  name: string;
  role: Role;
  createdAt: string;
  projectCount: number;
  boardCount: number;
  memberCount: number;
  projects: OrgProject[];
};

export function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function canManage(role: Role) {
  return role !== 'VIEWER';
}

export function canInvite(role: Role) {
  return role === 'OWNER';
}

export function formatRelativeTime(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'Recently';
  const diff = Math.max(0, Date.now() - time);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'Just now';
  if (diff < hour) {
    const minutes = Math.floor(diff / minute);
    return `${minutes}m ago`;
  }
  if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours}h ago`;
  }
  if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return `${days}d ago`;
  }

  const date = new Date(time);
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString(undefined, options);
}

export function greetingFor(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const first = name.trim().split(/\s+/)[0] || 'there';
  return `Good ${part}, ${first}`;
}

export function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Copy failed');
}

export function mutationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session expired. Refresh the page and sign in again.';
    if (error.status === 400 || error.status === 403) return error.message;
    if (error.status === 404) return 'That resource is no longer available.';
    return 'The server could not complete that action. Try again.';
  }
  return "We couldn't reach the server. Check your connection and try again.";
}

const TINTS = [
  'bg-indigo-50 text-indigo-700 ring-indigo-100',
  'bg-sky-50 text-sky-700 ring-sky-100',
  'bg-emerald-50 text-emerald-700 ring-emerald-100',
  'bg-amber-50 text-amber-700 ring-amber-100',
  'bg-rose-50 text-rose-700 ring-rose-100',
  'bg-violet-50 text-violet-700 ring-violet-100',
];

export function tintFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}
