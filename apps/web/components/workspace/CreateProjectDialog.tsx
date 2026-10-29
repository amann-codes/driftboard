'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { OrganizationSummary } from '@/lib/workspace';
import { mutationError } from '@/lib/workspace';
import Dialog from './Dialog';
import { FIELD_LABEL, INPUT, INPUT_ERROR, PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';

type CreatedProject = { id: string; name: string };

export default function CreateProjectDialog({
  open,
  onClose,
  organizations,
  initialOrgId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizations: OrganizationSummary[];
  initialOrgId?: string;
  onCreated: (project: CreatedProject, orgId: string) => void;
}) {
  const options = organizations.filter(organization => organization.role !== 'VIEWER');
  const initialOrganization = options.find(organization => organization.id === initialOrgId) ?? options[0];
  const inputRef = useRef<HTMLInputElement>(null);
  const [orgId, setOrgId] = useState(initialOrganization?.id ?? '');
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [orgError, setOrgError] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lockedOrganization = initialOrgId ? options.find(organization => organization.id === initialOrgId) : undefined;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!orgId) {
      setOrgError('Choose an organization.');
      return;
    }
    const value = name.trim();
    if (!value) {
      setFieldError('Enter a project name.');
      return;
    }
    if (value.length > 80) {
      setFieldError('Use 80 characters or fewer.');
      return;
    }

    setOrgError('');
    setFieldError('');
    setServerError('');
    setSubmitting(true);
    try {
      const project = await api<CreatedProject>(`/api/orgs/${encodeURIComponent(orgId)}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: value }),
      });
      onCreated(project, orgId);
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
      title="Create project"
      description="Projects group related boards inside an organization."
      busy={submitting}
      initialFocusRef={inputRef}
    >
      {options.length === 0 ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-800">
          You need an organization where you can create projects first.
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4" aria-busy={submitting}>
          <div>
            {lockedOrganization ? (
              <span className={FIELD_LABEL}>Organization</span>
            ) : (
              <label htmlFor="project-organization" className={FIELD_LABEL}>
                Organization
              </label>
            )}
            {lockedOrganization ? (
              <div className="mt-2 flex h-11 items-center rounded-lg border border-drift-line bg-drift-surface px-3.5 text-sm font-medium text-drift-ink">
                {lockedOrganization.name}
              </div>
            ) : (
              <select
                id="project-organization"
                name="organization"
                value={orgId}
                onChange={event => {
                  setOrgId(event.target.value);
                  setOrgError('');
                  setServerError('');
                }}
                aria-invalid={Boolean(orgError)}
                aria-describedby={orgError ? 'project-organization-error' : undefined}
                className={`mt-2 ${INPUT} ${orgError ? INPUT_ERROR : ''}`}
              >
                {options.map(organization => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            )}
            {orgError && (
              <p id="project-organization-error" className="mt-1.5 text-xs font-medium text-red-600">
                {orgError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="project-name" className={FIELD_LABEL}>
              Project name
            </label>
            <input
              ref={inputRef}
              id="project-name"
              name="name"
              type="text"
              value={name}
              onChange={event => {
                setName(event.target.value);
                setFieldError('');
                setServerError('');
              }}
              maxLength={80}
              placeholder="e.g. Website redesign"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'project-name-error' : undefined}
              className={`mt-2 ${INPUT} ${fieldError ? INPUT_ERROR : ''}`}
            />
            {fieldError && (
              <p id="project-name-error" className="mt-1.5 text-xs font-medium text-red-600">
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
            <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
              {submitting ? (
                <>
                  <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating…
                </>
              ) : (
                'Create project'
              )}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
