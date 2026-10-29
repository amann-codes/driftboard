import type { ReactNode } from 'react';
import type { OrganizationSummary, OrgProject, ProjectSummary, RecentBoard, Role } from '@/lib/workspace';
import { formatRelativeTime, initialsFor, roleLabel, tintFor } from '@/lib/workspace';
import { ArrowRightIcon, BoardIcon, FolderIcon, OrganizationsIcon, UsersIcon } from './icons';
import { CARD, CARD_HOVER, FOCUS_RING } from './styles';

function RoleBadge({ role }: { role: Role }) {
  const style =
    role === 'OWNER'
      ? 'bg-indigo-50 text-indigo-700 ring-indigo-100'
      : role === 'EDITOR'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
        : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${style}`}>
      {roleLabel(role)}
    </span>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-[-0.02em] text-drift-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-drift-body">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function OrganizationCard({ org }: { org: OrganizationSummary }) {
  const tint = tintFor(org.id);
  const previewProjects = org.projects.slice(0, 2);
  return (
    <a
      href={`/organizations/?id=${encodeURIComponent(org.id)}`}
      className={`group block ${CARD} ${CARD_HOVER} p-5 ${FOCUS_RING}`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold ring-1 ${tint}`}>
          {initialsFor(org.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[15px] font-semibold text-drift-ink">{org.name}</h3>
            <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-drift-accent" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RoleBadge role={org.role} />
            <span className="text-xs text-drift-muted">{org.memberCount} member{org.memberCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-drift-surface px-3 py-2.5">
          <p className="text-lg font-semibold leading-none text-drift-ink">{org.projectCount}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-drift-muted">Projects</p>
        </div>
        <div className="rounded-lg bg-drift-surface px-3 py-2.5">
          <p className="text-lg font-semibold leading-none text-drift-ink">{org.boardCount}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-drift-muted">Boards</p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {previewProjects.length > 0 ? (
          previewProjects.map(project => (
            <div key={project.id} className="flex items-center gap-2 text-xs text-drift-body">
              <FolderIcon className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{project.name}</span>
              <span className="ml-auto shrink-0 text-drift-muted">{project.boardCount}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-drift-muted">No projects yet</p>
        )}
        {org.projectCount > previewProjects.length && (
          <p className="text-xs text-drift-muted">+{org.projectCount - previewProjects.length} more project{org.projectCount - previewProjects.length === 1 ? '' : 's'}</p>
        )}
      </div>
    </a>
  );
}

export function BoardCard({ board }: { board: RecentBoard }) {
  const tint = tintFor(board.id);
  return (
    <a
      href={`/board/?id=${encodeURIComponent(board.id)}`}
      className={`group block overflow-hidden ${CARD} ${CARD_HOVER} ${FOCUS_RING}`}
    >
      <div className={`relative h-24 ${tint}`}>
        <div className="absolute inset-x-4 bottom-0 flex items-end gap-2 opacity-60" aria-hidden>
          <span className="h-10 w-1/4 rounded-t-md bg-white/70" />
          <span className="h-14 w-1/4 rounded-t-md bg-white/80" />
          <span className="h-8 w-1/4 rounded-t-md bg-white/60" />
          <span className="h-12 w-1/4 rounded-t-md bg-white/70" />
        </div>
        <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-white/70 text-current">
          <BoardIcon className="size-4" />
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-drift-ink">{board.name}</h3>
          <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-drift-accent" />
        </div>
        <p className="mt-1 truncate text-xs text-drift-body">
          {board.orgName} <span className="text-slate-300">/</span> {board.projectName}
        </p>
        <p className="mt-3 text-[11px] font-medium text-drift-muted">Updated {formatRelativeTime(board.lastActivityAt)}</p>
      </div>
    </a>
  );
}

export function ProjectRow({
  project,
  organization,
}: {
  project: ProjectSummary;
  organization: Pick<OrganizationSummary, 'id' | 'name'>;
}) {
  return (
    <a
      href={`/organizations/?id=${encodeURIComponent(organization.id)}#project-${encodeURIComponent(project.id)}`}
      className={`group flex items-center gap-3 rounded-xl border border-drift-line bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-drift-surface/60 ${FOCUS_RING}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
        <FolderIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-drift-ink">{project.name}</p>
        <p className="truncate text-xs text-drift-muted">{organization.name}</p>
      </div>
      <span className="hidden shrink-0 text-xs text-drift-muted sm:block">
        {project.boardCount} board{project.boardCount === 1 ? '' : 's'}
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-drift-accent" />
    </a>
  );
}

export function OrgProjectCard({
  project,
  canManage,
  onNewBoard,
}: {
  project: OrgProject;
  canManage: boolean;
  onNewBoard: () => void;
}) {
  return (
    <div id={`project-${project.id}`} className={`${CARD} scroll-mt-24 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <FolderIcon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-drift-ink">{project.name}</h3>
            <p className="mt-0.5 text-xs text-drift-muted">
              {project.boardCount} board{project.boardCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onNewBoard}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-drift-accent transition hover:bg-drift-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-accent focus-visible:ring-offset-2"
          >
            <span aria-hidden>+</span> New board
          </button>
        )}
      </div>

      {project.boards.length > 0 ? (
        <ul className="mt-4 divide-y divide-drift-line border-t border-drift-line">
          {project.boards.map(board => (
            <li key={board.id}>
              <a
                href={`/board/?id=${encodeURIComponent(board.id)}`}
                className={`group flex items-center gap-3 rounded-md px-1 py-3 transition hover:bg-drift-surface/70 ${FOCUS_RING}`}
              >
                <BoardIcon className="size-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-drift-ink">{board.name}</span>
                <span className="shrink-0 text-[11px] text-drift-muted">{formatRelativeTime(board.lastActivityAt)}</span>
                <ArrowRightIcon className="size-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-drift-accent" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-drift-line px-3 py-4 text-center text-xs text-drift-muted">
          No boards in this project yet.
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-drift-accent-soft text-drift-accent">
        {icon ?? <OrganizationsIcon />}
      </span>
      <h3 className="mt-4 text-sm font-semibold text-drift-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-drift-body">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function MemberCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-drift-muted">
      <UsersIcon className="size-3.5" />
      {count} member{count === 1 ? '' : 's'}
    </span>
  );
}
