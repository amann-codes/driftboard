'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { mutationError } from '@/lib/workspace';
import Dialog from './Dialog';
import { FIELD_LABEL, INPUT, INPUT_ERROR, PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';

type CreatedOrganization = { id: string; name: string };

export default function CreateOrganizationDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (organization: CreatedOrganization) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const value = name.trim();
    if (!value) {
      setFieldError('Enter an organization name.');
      return;
    }
    if (value.length > 80) {
      setFieldError('Use 80 characters or fewer.');
      return;
    }

    setFieldError('');
    setServerError('');
    setSubmitting(true);
    try {
      const organization = await api<CreatedOrganization>('/api/orgs', {
        method: 'POST',
        body: JSON.stringify({ name: value }),
      });
      onCreated(organization);
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
      title="Create organization"
      description="Organizations hold your projects, boards, and team members."
      busy={submitting}
      initialFocusRef={inputRef}
    >
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={submitting}>
        <div>
          <label htmlFor="organization-name" className={FIELD_LABEL}>
            Organization name
          </label>
          <input
            ref={inputRef}
            id="organization-name"
            name="name"
            type="text"
            value={name}
            onChange={event => {
              setName(event.target.value);
              setFieldError('');
              setServerError('');
            }}
            maxLength={80}
            placeholder="e.g. Northwind Creative"
            autoComplete="organization"
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'organization-name-error' : undefined}
            className={`mt-2 ${INPUT} ${fieldError ? INPUT_ERROR : ''}`}
          />
          {fieldError && (
            <p id="organization-name-error" className="mt-1.5 text-xs font-medium text-red-600">
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
              'Create organization'
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
