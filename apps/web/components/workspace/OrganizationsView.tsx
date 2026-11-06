'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { saveMe } from '@/lib/api';
import { useApiResource } from '@/lib/use-api-resource';
import type { OrgDetail, OrgListData, OrganizationSummary, Role } from '@/lib/workspace';
import { canInvite, canManage, initialsFor, roleLabel, tintFor } from '@/lib/workspace';
import CreateBoardDialog from './CreateBoardDialog';
import CreateOrganizationDialog from './CreateOrganizationDialog';
import CreateProjectDialog from './CreateProjectDialog';
import InviteMembersDialog from './InviteMembersDialog';
import { PlusIcon, UserPlusIcon } from './icons';
import { EmptyState, MemberCount, OrgProjectCard, OrganizationCard, SectionHeader } from './WorkspaceCards';
import WorkspaceShell from './WorkspaceShell';
import {
  OrganizationListSkeleton,
  OrganizationSkeleton,
  PageError,
  PageNotFound,
} from './WorkspaceStates';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';
import { ToastProvider, useToast } from './Toast';

function RolePill({ role }: { role: Role }) {
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

function toOrganizationSummary(org: OrgDetail): OrganizationSummary {
  return {
    id: org.id,
    name: org.name,
    role: org.role,
    createdAt: org.createdAt,
    projectCount: org.projectCount,
    boardCount: org.boardCount,
    memberCount: org.memberCount,
    projects: org.projects.map(project => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      boardCount: project.boardCount,
    })),
  };
}

function OrganizationListPage() {
  const { data, status, error, reload } = useApiResource<OrgListData>('/api/orgs');
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (data) saveMe({ user: data.user });
  }, [data]);

  const headerAction = (
    <button type="button" onClick={() => setCreating(true)} className={PRIMARY_BUTTON}>
      <PlusIcon className="size-4" />
      New organization
    </button>
  );

  const shell = (content: React.ReactNode) => (
    <WorkspaceShell title="Organizations" user={data?.user} actions={headerAction}>
      {content}
    </WorkspaceShell>
  );

  if (!data && status === 'loading') return shell(<OrganizationListSkeleton />);

  if (!data && status === 'error') {
    return shell(
      <PageError
        message={error || "We couldn't load your organizations. Check your connection and try again."}
        onRetry={() => void reload()}
      />,
    );
  }

  if (!data) return shell(<OrganizationListSkeleton />);

  return shell(
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-drift-body">
          Organizations bring projects, boards, and teammates together. Open one to see its work, or create a new space.
        </p>
        <span className="text-xs font-medium text-drift-muted">
          {data.organizations.length} organization{data.organizations.length === 1 ? '' : 's'}
        </span>
      </div>

      {data.organizations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.organizations.map(organization => (
            <OrganizationCard key={organization.id} org={organization} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No organizations yet"
          description="Create an organization to bring your first project, board, and teammates together."
          action={
            <button type="button" onClick={() => setCreating(true)} className={PRIMARY_BUTTON}>
              <PlusIcon className="size-4" />
              Create organization
            </button>
          }
        />
      )}

      {creating && (
        <CreateOrganizationDialog
          open
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast.push({ kind: 'success', message: 'Organization created.' });
            void reload(true).catch(() => {
              toast.push({ kind: 'error', message: 'The organization was created, but the list could not refresh. Reload to see it.' });
            });
          }}
        />
      )}
    </div>,
  );
}

function OrganizationDetailPage({ organizationId }: { organizationId: string }) {
  const { data, status, error, notFound, reload } = useApiResource<OrgDetail>(
    `/api/orgs/${encodeURIComponent(organizationId)}`,
  );
  const [dialog, setDialog] = useState<'project' | 'board' | 'invite' | null>(null);
  const [boardProjectId, setBoardProjectId] = useState<string | undefined>();
  const toast = useToast();

  useEffect(() => {
    if (data) saveMe({ user: data.user });
  }, [data]);

  useEffect(() => {
    if (!data || !window.location.hash.startsWith('#project-')) return;
    let targetId: string;
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const frame = requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [data]);

  const closeDialog = () => {
    setDialog(null);
    setBoardProjectId(undefined);
  };

  const openBoard = (projectId?: string) => {
    setBoardProjectId(projectId);
    setDialog('board');
  };

  const refreshAfterCreate = async (message: string) => {
    toast.push({ kind: 'success', message });
    try {
      await reload(true);
    } catch {
      toast.push({ kind: 'error', message: 'The item was created, but this organization could not refresh. Reload to see it.' });
    }
  };

  const canEdit = data ? canManage(data.role) : false;
  const canSendInvite = data ? canInvite(data.role) : false;

  let headerAction: React.ReactNode;
  if (data && canEdit) {
    headerAction =
      data.projects.length > 0 ? (
        <button type="button" onClick={() => openBoard()} className={PRIMARY_BUTTON}>
          <PlusIcon className="size-4" />
          New board
        </button>
      ) : (
        <button type="button" onClick={() => setDialog('project')} className={PRIMARY_BUTTON}>
          <PlusIcon className="size-4" />
          New project
        </button>
      );
  }

  const shell = (content: React.ReactNode) => (
    <WorkspaceShell
      title={data?.name ?? 'Organization'}
      breadcrumb={{ label: 'Organizations', href: '/organizations/' }}
      user={data?.user}
      actions={headerAction}
    >
      {content}
    </WorkspaceShell>
  );

  if (!data && status === 'loading') return shell(<OrganizationSkeleton />);

  if (!data && notFound) {
    return shell(
      <PageNotFound
        title="Organization not found"
        message="This organization doesn't exist, or you don't have access to it."
      />,
    );
  }

  if (!data && status === 'error') {
    return shell(
      <PageError
        message={error || "We couldn't load this organization. Check your connection and try again."}
        onRetry={() => void reload()}
        backHref="/organizations/"
        backLabel="Back to organizations"
      />,
    );
  }

  if (!data) return shell(<OrganizationSkeleton />);

  const organizationForDialog = toOrganizationSummary(data);
  const tint = tintFor(data.id);
  const created = new Date(data.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return shell(
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-drift-line bg-white">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className={`grid size-14 shrink-0 place-items-center rounded-2xl text-base font-bold ring-1 ${tint}`}>
              {initialsFor(data.name)}
            </span>
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold tracking-[-0.035em] text-drift-ink">{data.name}</h2>
              <p className="mt-1 text-sm text-drift-muted">Created {created}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <RolePill role={data.role} />
            <MemberCount count={data.memberCount} />
            {canSendInvite && (
              <button type="button" onClick={() => setDialog('invite')} className={SECONDARY_BUTTON}>
                <UserPlusIcon className="size-4" />
                Invite members
              </button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-drift-line border-t border-drift-line bg-drift-surface/60">
          {[
            { label: 'Projects', value: data.projectCount },
            { label: 'Boards', value: data.boardCount },
            { label: 'Members', value: data.memberCount },
          ].map(stat => (
            <div key={stat.label} className="px-5 py-4">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-drift-muted">{stat.label}</dt>
              <dd className="mt-1 text-xl font-semibold leading-none text-drift-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="organization-projects">
        <SectionHeader
          id="organization-projects"
          title="Projects"
          description={
            canEdit
              ? 'Open a board directly, or add a board to a project.'
              : 'Open a board to see its current work.'
          }
          action={
            canEdit ? (
              <button type="button" onClick={() => setDialog('project')} className={`${SECONDARY_BUTTON} h-9 px-3 text-xs`}>
                <PlusIcon className="size-3.5" />
                New project
              </button>
            ) : undefined
          }
        />
        {data.projects.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.projects.map(project => (
              <OrgProjectCard
                key={project.id}
                project={project}
                canManage={canEdit}
                onNewBoard={() => openBoard(project.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No projects yet"
            description={
              canEdit
                ? 'Create a project to group related boards inside this organization.'
                : 'An editor or owner can add the first project to this organization.'
            }
            action={
              canEdit ? (
                <button type="button" onClick={() => setDialog('project')} className={PRIMARY_BUTTON}>
                  <PlusIcon className="size-4" />
                  Create project
                </button>
              ) : undefined
            }
          />
        )}
      </section>

      {dialog === 'project' && (
        <CreateProjectDialog
          open
          onClose={closeDialog}
          organizations={[organizationForDialog]}
          initialOrgId={data.id}
          onCreated={() => {
            closeDialog();
            void refreshAfterCreate('Project created.');
          }}
        />
      )}
      {dialog === 'board' && (
        <CreateBoardDialog
          open
          onClose={closeDialog}
          organizations={[organizationForDialog]}
          initialOrgId={data.id}
          initialProjectId={boardProjectId}
          onCreated={board => {
            closeDialog();
            window.location.assign(`/board/?id=${encodeURIComponent(board.id)}`);
          }}
        />
      )}
      {dialog === 'invite' && (
        <InviteMembersDialog
          open
          onClose={closeDialog}
          organization={{ id: data.id, name: data.name }}
        />
      )}
    </div>,
  );
}

function OrganizationsPage() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('id')?.trim() ?? '';

  return organizationId ? (
    <OrganizationDetailPage key={organizationId} organizationId={organizationId} />
  ) : (
    <OrganizationListPage />
  );
}

function OrganizationsFallback() {
  return (
    <WorkspaceShell title="Organizations">
      <OrganizationListSkeleton />
    </WorkspaceShell>
  );
}

export default function OrganizationsView() {
  return (
    <ToastProvider>
      <Suspense fallback={<OrganizationsFallback />}>
        <OrganizationsPage />
      </Suspense>
    </ToastProvider>
  );
}
