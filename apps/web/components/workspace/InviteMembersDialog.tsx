'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { copyText, mutationError } from '@/lib/workspace';
import Dialog from './Dialog';
import { CheckIcon, CopyIcon, UserPlusIcon } from './icons';
import { FIELD_LABEL, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';
import { useToast } from './Toast';

type InviteRole = 'EDITOR' | 'VIEWER';
type InviteResult = { role: InviteRole; url: string; expiresAt: string };
type CopyState = 'idle' | 'copying' | 'copied' | 'error';

export default function InviteMembersDialog({
  open,
  onClose,
  organization,
}: {
  open: boolean;
  onClose: () => void;
  organization: { id: string; name: string };
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [role, setRole] = useState<InviteRole>('EDITOR');
  const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const copyLink = async (value: string) => {
    setCopyState('copying');
    try {
      await copyText(value);
      setCopyState('copied');
      toast.push({ kind: 'success', message: 'Invite link copied to clipboard.' });
    } catch {
      setCopyState('error');
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setServerError('');
    setCopyState('idle');
    try {
      const invite = await api<InviteResult>(`/api/orgs/${encodeURIComponent(organization.id)}/invites`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      setLink(invite.url);
      setExpiresAt(invite.expiresAt);
      await copyLink(invite.url);
    } catch (error) {
      setServerError(mutationError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = (nextRole: InviteRole) => {
    setRole(nextRole);
    setLink(null);
    setExpiresAt(null);
    setCopyState('idle');
    setServerError('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Invite members to ${organization.name}`}
      description="Generate a role-specific link. The link expires after seven days."
      busy={submitting}
      initialFocusRef={selectRef}
    >
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={submitting}>
        <div>
          <label htmlFor="invite-role" className={FIELD_LABEL}>
            Role
          </label>
          <select
            ref={selectRef}
            id="invite-role"
            name="role"
            value={role}
            onChange={event => changeRole(event.target.value as InviteRole)}
            aria-describedby="invite-role-hint"
            className={`mt-2 ${INPUT}`}
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <p id="invite-role-hint" className="mt-1.5 text-xs leading-5 text-drift-muted">
            {role === 'EDITOR'
              ? 'Editors can create projects and boards, and edit board content.'
              : 'Viewers can browse boards without changing them.'}
          </p>
        </div>

        {serverError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {serverError}
          </div>
        )}

        {link && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-emerald-900">
                  {copyState === 'copied' ? 'Invite link copied' : 'Invite link ready'}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-emerald-800">
                  {role === 'EDITOR' ? 'Editor' : 'Viewer'} access
                  {expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => link && void copyLink(link)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                  <CopyIcon className="size-3.5" />
                  {copyState === 'copying' ? 'Copying…' : copyState === 'copied' ? 'Copy again' : 'Copy link'}
                </button>
                {copyState === 'error' && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                    The link was created, but automatic copying failed. Use “Copy link” above.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-lg bg-drift-surface px-3.5 py-3 text-xs leading-5 text-drift-body">
          <UserPlusIcon className="mt-0.5 size-4 shrink-0 text-drift-muted" />
          Anyone signed in who opens this link can join as {role === 'EDITOR' ? 'an editor' : 'a viewer'}. The link is reusable until it expires.
        </p>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className={SECONDARY_BUTTON}>
            Close
          </button>
          <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
            {submitting ? (
              <>
                <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Creating…
              </>
            ) : link ? (
              'Create another invite'
            ) : (
              'Create invite'
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
