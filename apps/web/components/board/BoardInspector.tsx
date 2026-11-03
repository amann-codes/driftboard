'use client';

import { useEffect, useRef } from 'react';
import type { BoardState, ClientOp, OpInput, Role } from '@driftboard/shared';
import { describeOp } from '@driftboard/shared';
import Avatar from '@/components/Avatar';
import { CheckIcon, CloseIcon, RefreshIcon, UsersIcon } from '@/components/workspace/icons';
import { FOCUS_RING, GHOST_BUTTON, SECONDARY_BUTTON } from '@/components/workspace/styles';
import type { Member, PresenceUser, WebSocketStatus } from '@/lib/use-board';
import { roleLabel } from '@/lib/workspace';
import { ArchiveIcon, ChevronRightIcon, LinkIcon, RestoreIcon, WifiOffIcon } from './icons';

type Props = {
  open: boolean;
  drawer: boolean;
  onClose: () => void;
  name: string;
  role: Role;
  orgId?: string;
  projectId?: string;
  orgName?: string;
  projectName?: string;
  members: Member[];
  presence: PresenceUser[];
  currentUserId?: string;
  view: BoardState;
  pending: ClientOp[];
  sending: Set<string>;
  online: boolean;
  wsStatus: WebSocketStatus;
  syncError: string;
  onCopyLink: () => void;
  onRetry: () => void;
  onOpenCard: (cardId: string) => void;
  readOnly: boolean;
  run: (input: OpInput) => void;
};

const ROLE_STYLES: Record<Role, string> = {
  OWNER: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  EDITOR: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  VIEWER: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function BoardInspector({
  open,
  drawer,
  onClose,
  name,
  role,
  orgId,
  projectId,
  orgName,
  projectName,
  members,
  presence,
  currentUserId,
  view,
  pending,
  sending,
  online,
  wsStatus,
  syncError,
  onCopyLink,
  onRetry,
  onOpenCard,
  readOnly,
  run,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const presenceByUser = new Map(presence.map(user => [user.userId, user]));
  const archived = Object.values(view.cards).filter(card => card.archived);
  const onlineCount = new Set(presence.map(user => user.userId)).size;
  const orgHref = orgId ? `/organizations/?id=${encodeURIComponent(orgId)}` : '/organizations/';
  const projectHref = orgId
    ? `/organizations/?id=${encodeURIComponent(orgId)}${projectId ? `#project-${encodeURIComponent(projectId)}` : ''}`
    : orgHref;

  useEffect(() => {
    if (!open || !drawer) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.getElementById('board-inspector-toggle')?.focus();
    };
  }, [open, drawer]);

  if (!open) return null;

  const panel = (
    <aside
      ref={panelRef}
      id="board-inspector"
      aria-label="Board details"
      role={drawer ? 'dialog' : undefined}
      aria-modal={drawer ? true : undefined}
      className={`flex h-full flex-col border-drift-line bg-white ${
        drawer
          ? 'fixed inset-y-0 right-0 z-50 w-[min(360px,94vw)] border-l shadow-[-18px_0_50px_rgba(15,23,42,0.16)]'
          : 'w-[320px] shrink-0 border-l'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-drift-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-drift-ink">Board details</h2>
          <p className="mt-0.5 text-[11px] text-drift-muted">{roleLabel(role)} access</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close board details"
          className={`${GHOST_BUTTON} size-9 px-0`}
        >
          <CloseIcon className="size-[18px]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section aria-labelledby="board-context-heading">
          <h3 id="board-context-heading" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Workspace
          </h3>
          <p className="mt-2 truncate text-sm font-semibold text-drift-ink" title={name}>
            {name}
          </p>
          <div className="mt-2 space-y-1.5 text-xs">
            <a href={orgHref} className={`flex items-center gap-1.5 rounded text-drift-body transition hover:text-drift-ink ${FOCUS_RING}`}>
              <span className="truncate">{orgName ?? 'Organization'}</span>
            </a>
            <a href={projectHref} className={`flex items-center gap-1.5 rounded text-drift-body transition hover:text-drift-ink ${FOCUS_RING}`}>
              <ChevronRightIcon className="size-3 text-slate-300" />
              <span className="truncate">{projectName ?? 'Project'}</span>
            </a>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${ROLE_STYLES[role]}`}>
              {roleLabel(role)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-drift-muted">
              <UsersIcon className="size-3.5" />
              {members.length} member{members.length === 1 ? '' : 's'}
            </span>
          </div>
          {readOnly && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-drift-body">
              You can view this board, but only editors and owners can make changes.
            </p>
          )}
          <button type="button" onClick={onCopyLink} className={`${SECONDARY_BUTTON} mt-3 h-9 w-full px-3 text-xs`}>
            <LinkIcon className="size-3.5" />
            Copy board link
          </button>
        </section>

        <section aria-labelledby="board-people-heading" className="mt-6 border-t border-drift-line pt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="board-people-heading" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              People
            </h3>
            <span className="text-[10px] font-medium text-drift-muted">
              {!online ? 'Offline' : wsStatus === 'live' ? `${onlineCount} online` : 'Connecting…'}
            </span>
          </div>
          {!online && <p className="mt-2 text-xs text-drift-muted">Live presence is unavailable while offline.</p>}
          <ul className="mt-3 space-y-2.5">
            {members.map(member => {
              const live = presenceByUser.get(member.id);
              const editing = live?.editing[0] ? view.cards[live.editing[0]]?.title : null;
              return (
                <li key={member.id} className="flex items-start gap-2.5">
                  <span className="relative mt-0.5 shrink-0">
                    <Avatar id={member.id} name={member.name} className="size-7 text-[10px]" />
                    {live && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-emerald-500" aria-label="Online" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-drift-ink">{member.name}</span>
                      {member.id === currentUserId && <span className="shrink-0 text-[10px] text-drift-muted">You</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-drift-muted">
                      {editing ? `Editing ${editing}` : live ? 'Viewing board' : roleLabel(member.role)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="board-sync-heading" className="mt-6 border-t border-drift-line pt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="board-sync-heading" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Sync
            </h3>
            {pending.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {pending.length} pending
              </span>
            )}
          </div>

          {syncError && (
            <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {syncError}
            </p>
          )}

          {!online && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-drift-body">
              <WifiOffIcon className="mt-0.5 size-4 shrink-0" />
              Offline. Changes are saved here and will sync when the connection returns.
            </p>
          )}

          {pending.length === 0 ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-drift-muted">
              <CheckIcon className="size-3.5 text-emerald-600" />
              Everything is synced.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {pending.map(op => (
                  <li key={op.opId} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs leading-5 text-drift-body">{describeOp(op, view)}</p>
                    <p className="mt-0.5 text-[10px] text-drift-muted">
                      {sending.has(op.opId) ? 'Sending…' : online ? 'Queued' : 'Waiting for network'}
                    </p>
                  </li>
                ))}
              </ul>
              {online && (
                <button type="button" onClick={onRetry} className={`${SECONDARY_BUTTON} mt-3 h-9 w-full px-3 text-xs`}>
                  <RefreshIcon className="size-3.5" />
                  Sync now
                </button>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="board-archive-heading" className="mt-6 border-t border-drift-line pt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="board-archive-heading" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Archived cards
            </h3>
            <span className="text-[10px] font-medium text-drift-muted">{archived.length}</span>
          </div>
          {archived.length === 0 ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-drift-muted">
              <ArchiveIcon className="size-3.5" />
              No archived cards.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-drift-line">
              {archived.map(card => (
                <li key={card.id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={() => onOpenCard(card.id)}
                    className={`min-w-0 flex-1 truncate rounded border-0 bg-transparent p-0 text-left text-xs text-drift-body transition hover:text-drift-ink ${FOCUS_RING}`}
                    title={card.title}
                  >
                    {card.title}
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => run({ type: 'card.set', cardId: card.id, field: 'archived', value: false })}
                      aria-label={`Restore ${card.title}`}
                      className={`grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-drift-muted transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
                    >
                      <RestoreIcon className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );

  if (!drawer) return panel;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/35 xl:hidden" onClick={onClose} aria-hidden />
      {panel}
    </>
  );
}
