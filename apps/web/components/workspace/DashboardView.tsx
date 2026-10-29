'use client';

import { useEffect, useState } from 'react';
import { saveMe } from '@/lib/api';
import { useApiResource } from '@/lib/use-api-resource';
import type { DashboardData } from '@/lib/workspace';
import { canManage, greetingFor } from '@/lib/workspace';
import CreateBoardDialog from './CreateBoardDialog';
import CreateOrganizationDialog from './CreateOrganizationDialog';
import CreateProjectDialog from './CreateProjectDialog';
import { PlusIcon } from './icons';
import { BoardCard, EmptyState, OrganizationCard, ProjectRow, SectionHeader } from './WorkspaceCards';
import WorkspaceShell from './WorkspaceShell';
import { DashboardSkeleton, PageError } from './WorkspaceStates';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';
import { ToastProvider, useToast } from './Toast';

type DialogName = 'organization' | 'project' | 'board' | null;

function DashboardPage() {
  const { data, status, error, reload } = useApiResource<DashboardData>('/api/dashboard');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [boardContext, setBoardContext] = useState<{ orgId?: string; projectId?: string }>({});
  const toast = useToast();

  useEffect(() => {
    if (data) saveMe({ user: data.user });
  }, [data]);

  const openBoard = (context: { orgId?: string; projectId?: string } = {}) => {
    setBoardContext(context);
    setDialog('board');
  };

  const closeDialog = () => {
    setDialog(null);
    setBoardContext({});
  };

  const refreshAfterCreate = async (message: string) => {
    toast.push({ kind: 'success', message });
    try {
      await reload(true);
    } catch {
      toast.push({ kind: 'error', message: 'The item was created, but the dashboard could not refresh. Reload to see it.' });
    }
  };

  const organizations = data?.organizations ?? [];
  const manageableOrganizations = organizations.filter(organization => canManage(organization.role));
  const canCreateBoard = manageableOrganizations.some(organization => organization.projects.length > 0);
  const canCreateProject = manageableOrganizations.length > 0;
  const projects = organizations
    .flatMap(organization =>
      organization.projects.map(project => ({
        project,
        organization: { id: organization.id, name: organization.name },
      })),
    )
    .sort((a, b) => Date.parse(b.project.createdAt) - Date.parse(a.project.createdAt));

  let headerAction = <span className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" aria-hidden />;
  if (data) {
    if (canCreateBoard) {
      headerAction = (
        <button type="button" onClick={() => openBoard()} className={PRIMARY_BUTTON}>
          <PlusIcon className="size-4" />
          New board
        </button>
      );
    } else if (canCreateProject) {
      headerAction = (
        <button type="button" onClick={() => setDialog('project')} className={PRIMARY_BUTTON}>
          <PlusIcon className="size-4" />
          New project
        </button>
      );
    } else {
      headerAction = (
        <button type="button" onClick={() => setDialog('organization')} className={PRIMARY_BUTTON}>
          <PlusIcon className="size-4" />
          Create organization
        </button>
      );
    }
  }

  const shell = (content: React.ReactNode) => (
    <WorkspaceShell title="Dashboard" user={data?.user} actions={headerAction}>
      {content}
    </WorkspaceShell>
  );

  if (!data && status === 'loading') return shell(<DashboardSkeleton />);

  if (!data && status === 'error') {
    return shell(
      <PageError
        message={error || "We couldn't load your workspace. Check your connection and try again."}
        onRetry={() => void reload()}
      />,
    );
  }

  if (!data) return shell(<DashboardSkeleton />);

  const summary = `${data.totals.organizations} organization${data.totals.organizations === 1 ? '' : 's'} · ${data.totals.projects} project${data.totals.projects === 1 ? '' : 's'} · ${data.totals.boards} board${data.totals.boards === 1 ? '' : 's'}`;

  return shell(
    <div className="space-y-9">
      <section className="rounded-2xl border border-drift-line bg-white p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-drift-accent">Your workspace</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-drift-ink sm:text-3xl">
          {greetingFor(data.user.name)}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-drift-body">
          {data.totals.organizations === 0
            ? 'Create an organization to bring your projects, boards, and team together.'
            : 'Here is what is moving across your teams. Open a board to pick up where you left off.'}
        </p>
        {data.totals.organizations > 0 && <p className="mt-4 text-xs font-medium text-drift-muted">{summary}</p>}
      </section>

      {organizations.length === 0 ? (
        <section aria-labelledby="getting-started">
          <SectionHeader title="Getting started" description="Your workspace is ready for its first organization." />
          <EmptyState
            title="Create your first organization"
            description="Organizations hold projects and boards, and let you invite teammates with the right role."
            action={
              <button type="button" onClick={() => setDialog('organization')} className={PRIMARY_BUTTON}>
                <PlusIcon className="size-4" />
                Create organization
              </button>
            }
          />
        </section>
      ) : (
        <>
          <section aria-labelledby="recent-boards">
            <SectionHeader
              title="Recent boards"
              description="Boards you and your team updated most recently."
              action={
                <a href="/organizations/" className={`${SECONDARY_BUTTON} h-9 px-3 text-xs`}>
                  Browse organizations
                </a>
              }
            />
            {data.recentBoards.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.recentBoards.map(board => (
                  <BoardCard key={board.id} board={board} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No boards yet"
                description={
                  canCreateBoard
                    ? 'Create a board inside one of your projects and it will appear here.'
                    : canCreateProject
                      ? 'Create a project first, then add a board to it.'
                      : 'You have view-only access. A project editor or owner can add the first board.'
                }
                action={
                  canCreateBoard ? (
                    <button type="button" onClick={() => openBoard()} className={PRIMARY_BUTTON}>
                      <PlusIcon className="size-4" />
                      New board
                    </button>
                  ) : canCreateProject ? (
                    <button type="button" onClick={() => setDialog('project')} className={PRIMARY_BUTTON}>
                      <PlusIcon className="size-4" />
                      Create project
                    </button>
                  ) : undefined
                }
              />
            )}
          </section>

          <section aria-labelledby="organizations">
            <SectionHeader
              title="Organizations"
              description="The teams and spaces you belong to."
              action={
                <div className="flex items-center gap-2">
                  <a href="/organizations/" className={`${SECONDARY_BUTTON} h-9 px-3 text-xs`}>
                    View all
                  </a>
                  <button type="button" onClick={() => setDialog('organization')} className={`${SECONDARY_BUTTON} h-9 px-3 text-xs`}>
                    <PlusIcon className="size-3.5" />
                    New
                  </button>
                </div>
              }
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {organizations.slice(0, 3).map(organization => (
                <OrganizationCard key={organization.id} org={organization} />
              ))}
            </div>
            {organizations.length > 3 && (
              <a href="/organizations/" className="mt-4 inline-flex items-center text-sm font-medium text-drift-accent hover:text-drift-accent-hover">
                View all {organizations.length} organizations
              </a>
            )}
          </section>

          <section aria-labelledby="projects">
            <SectionHeader
              title="Projects"
              description="A quick view across your organizations."
              action={
                canCreateProject ? (
                  <button type="button" onClick={() => setDialog('project')} className={`${SECONDARY_BUTTON} h-9 px-3 text-xs`}>
                    <PlusIcon className="size-3.5" />
                    New project
                  </button>
                ) : undefined
              }
            />
            {projects.length > 0 ? (
              <>
                <div className="grid gap-2 lg:grid-cols-2">
                  {projects.slice(0, 4).map(({ project, organization }) => (
                    <ProjectRow key={project.id} project={project} organization={organization} />
                  ))}
                </div>
                {projects.length > 4 && (
                  <a href="/organizations/" className="mt-3 inline-flex items-center text-sm font-medium text-drift-accent hover:text-drift-accent-hover">
                    See all projects in your organizations
                  </a>
                )}
              </>
            ) : (
              <EmptyState
                title="No projects yet"
                description={
                  canCreateProject
                    ? 'Projects group related boards. Create one to give your boards a home.'
                    : 'Projects are managed by editors and owners in your organizations.'
                }
                action={
                  canCreateProject ? (
                    <button type="button" onClick={() => setDialog('project')} className={PRIMARY_BUTTON}>
                      <PlusIcon className="size-4" />
                      Create project
                    </button>
                  ) : undefined
                }
              />
            )}
          </section>
        </>
      )}

      {dialog === 'organization' && (
        <CreateOrganizationDialog
          open
          onClose={closeDialog}
          onCreated={() => {
            closeDialog();
            void refreshAfterCreate('Organization created.');
          }}
        />
      )}
      {dialog === 'project' && (
        <CreateProjectDialog
          open
          onClose={closeDialog}
          organizations={organizations}
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
          organizations={organizations}
          initialOrgId={boardContext.orgId}
          initialProjectId={boardContext.projectId}
          onCreated={board => {
            closeDialog();
            window.location.assign(`/board/?id=${encodeURIComponent(board.id)}`);
          }}
        />
      )}
    </div>,
  );
}

export default function DashboardView() {
  return (
    <ToastProvider>
      <DashboardPage />
    </ToastProvider>
  );
}
