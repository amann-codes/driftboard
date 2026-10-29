'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { OrganizationSummary } from '@/lib/workspace';
import { mutationError } from '@/lib/workspace';
import Dialog from './Dialog';
import { FIELD_LABEL, INPUT, INPUT_ERROR, PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';

type CreatedBoard = { id: string; name: string };

export default function CreateBoardDialog({
  open,
  onClose,
  organizations,
  initialOrgId,
  initialProjectId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizations: OrganizationSummary[];
  initialOrgId?: string;
  initialProjectId?: string;
  onCreated: (board: CreatedBoard, context: { orgId: string; projectId: string }) => void;
}) {
  const manageable = organizations.filter(organization => organization.role !== 'VIEWER');
  const projectOrganization = initialProjectId
    ? manageable.find(organization => organization.projects.some(project => project.id === initialProjectId))
    : undefined;
  const initialOrganization = projectOrganization ?? manageable.find(organization => organization.id === initialOrgId) ?? manageable[0];
  const projectsFor = (organizationId: string) =>
    manageable.find(organization => organization.id === organizationId)?.projects ?? [];
  const initialProjects = projectsFor(initialOrganization?.id ?? '');
  const initialProject = initialProjects.find(project => project.id === initialProjectId) ?? initialProjects[0];

  const inputRef = useRef<HTMLInputElement>(null);
  const [orgId, setOrgId] = useState(initialOrganization?.id ?? '');
  const [projectId, setProjectId] = useState(initialProject?.id ?? '');
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [orgError, setOrgError] = useState('');
  const [projectError, setProjectError] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const projects = projectsFor(orgId);
  const selectedOrganization = manageable.find(organization => organization.id === orgId);
  const selectedProject = projects.find(project => project.id === projectId);
  const lockedOrganization = Boolean(initialOrgId || initialProjectId);
  const lockedProject = Boolean(initialProjectId && projectOrganization);

  const changeOrganization = (nextOrgId: string) => {
    const nextProjects = projectsFor(nextOrgId);
    setOrgId(nextOrgId);
    setProjectId(nextProjects[0]?.id ?? '');
    setOrgError('');
    setProjectError('');
    setServerError('');
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!orgId) {
      setOrgError('Choose an organization.');
      return;
    }
    if (!projectId) {
      setProjectError('Choose a project. Boards live inside projects.');
      return;
    }
    const value = name.trim();
    if (!value) {
      setFieldError('Enter a board name.');
      return;
    }
    if (value.length > 80) {
      setFieldError('Use 80 characters or fewer.');
      return;
    }

    setOrgError('');
    setProjectError('');
    setFieldError('');
    setServerError('');
    setSubmitting(true);
    try {
      const board = await api<CreatedBoard>(`/api/projects/${encodeURIComponent(projectId)}/boards`, {
        method: 'POST',
        body: JSON.stringify({ name: value }),
      });
      onCreated(board, { orgId, projectId });
    } catch (error) {
      setServerError(mutationError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create board"
      description="Boards live inside a project and stay available offline once opened."
      busy={submitting}
      initialFocusRef={inputRef}
    >
      {manageable.length === 0 ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-800">
          You need an organization where you can create boards first.
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4" aria-busy={submitting}>
          <div>
            <span className={FIELD_LABEL}>Organization</span>
            {lockedOrganization && selectedOrganization ? (
              <div className="mt-2 flex h-11 items-center rounded-lg border border-drift-line bg-drift-surface px-3.5 text-sm font-medium text-drift-ink">
                {selectedOrganization.name}
              </div>
            ) : (
              <select
                aria-label="Organization"
                value={orgId}
                onChange={event => changeOrganization(event.target.value)}
                aria-invalid={Boolean(orgError)}
                aria-describedby={orgError ? 'board-organization-error' : undefined}
                className={`mt-2 ${INPUT} ${orgError ? INPUT_ERROR : ''}`}
              >
                {manageable.map(organization => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            )}
            {orgError && (
              <p id="board-organization-error" className="mt-1.5 text-xs font-medium text-red-600">
                {orgError}
              </p>
            )}
          </div>

          <div>
            {lockedProject || projects.length === 0 ? (
              <span className={FIELD_LABEL}>Project</span>
            ) : (
              <label htmlFor="board-project" className={FIELD_LABEL}>
                Project
              </label>
            )}
            {lockedProject && selectedProject ? (
              <div className="mt-2 flex h-11 items-center rounded-lg border border-drift-line bg-drift-surface px-3.5 text-sm font-medium text-drift-ink">
                {selectedProject.name}
              </div>
            ) : projects.length > 0 ? (
              <select
                id="board-project"
                name="project"
                value={projectId}
                onChange={event => {
                  setProjectId(event.target.value);
                  setProjectError('');
                  setServerError('');
                }}
                aria-invalid={Boolean(projectError)}
                aria-describedby={projectError ? 'board-project-error' : undefined}
                className={`mt-2 ${INPUT} ${projectError ? INPUT_ERROR : ''}`}
              >
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-800">
                This organization has no projects yet. Create a project before adding a board.
              </p>
            )}
            {projectError && (
              <p id="board-project-error" className="mt-1.5 text-xs font-medium text-red-600">
                {projectError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="board-name" className={FIELD_LABEL}>
              Board name
            </label>
            <input
              ref={inputRef}
              id="board-name"
              name="name"
              type="text"
              value={name}
              onChange={event => {
                setName(event.target.value);
                setFieldError('');
                setServerError('');
              }}
              maxLength={80}
              placeholder="e.g. Product roadmap"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'board-name-error' : undefined}
              className={`mt-2 ${INPUT} ${fieldError ? INPUT_ERROR : ''}`}
            />
            {fieldError && (
              <p id="board-name-error" className="mt-1.5 text-xs font-medium text-red-600">
                {fieldError}
              </p>
            )}
          </div>

          {serverError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
              {serverError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={submitting} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || projects.length === 0} className={PRIMARY_BUTTON}>
              {submitting ? (
                <>
                  <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating…
                </>
              ) : (
                'Create board'
              )}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
