'use client';

import type { PresenceUser, WebSocketStatus } from '@/lib/use-board';
import type { Role } from '@driftboard/shared';
import type { WorkspaceUser } from '@/lib/workspace';
import { roleLabel } from '@/lib/workspace';
import AccountMenu from '@/components/workspace/AccountMenu';
import { FOCUS_RING, ICON_BUTTON } from '@/components/workspace/styles';
import { ArrowLeftIcon, ChevronRightIcon, PanelRightIcon, RedoIcon, UndoIcon } from './icons';
import PresenceAvatars from './PresenceAvatars';
import SyncStatus from './SyncStatus';
import ToolbarMenu from './ToolbarMenu';

type Props = {
  name: string;
  role: Role;
  orgId?: string;
  projectId?: string;
  orgName?: string;
  projectName?: string;
  user?: WorkspaceUser;
  presence: PresenceUser[];
  currentUserId?: string;
  online: boolean;
  authLost: boolean;
  simOffline: boolean;
  pending: number;
  sending: number;
  syncError: string;
  wsStatus: WebSocketStatus;
  canUndo: boolean;
  canRedo: boolean;
  inspectorOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleInspector: () => void;
  onOpenInspector: () => void;
  onCopyLink: () => void;
  onSimOfflineChange: (value: boolean) => void;
};

export default function BoardToolbar({
  name,
  role,
  orgId,
  projectId,
  orgName,
  projectName,
  user,
  presence,
  currentUserId,
  online,
  authLost,
  simOffline,
  pending,
  sending,
  syncError,
  wsStatus,
  canUndo,
  canRedo,
  inspectorOpen,
  onUndo,
  onRedo,
  onToggleInspector,
  onOpenInspector,
  onCopyLink,
  onSimOfflineChange,
}: Props) {
  const orgHref = orgId ? `/organizations/?id=${encodeURIComponent(orgId)}` : '/organizations/';
  const projectHref = orgId
    ? `/organizations/?id=${encodeURIComponent(orgId)}${projectId ? `#project-${encodeURIComponent(projectId)}` : ''}`
    : orgHref;

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-drift-line bg-white px-2 sm:h-16 sm:gap-2 sm:px-4">
      <a href="/dashboard/" aria-label="Back to dashboard" className={`${ICON_BUTTON} shrink-0`}>
        <ArrowLeftIcon className="size-[18px]" />
      </a>

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5">
        <a
          href={orgHref}
          className={`hidden max-w-44 truncate rounded text-xs font-medium text-drift-muted transition hover:text-drift-ink sm:inline ${FOCUS_RING}`}
        >
          {orgName ?? 'Organizations'}
        </a>
        <ChevronRightIcon className="hidden size-3.5 shrink-0 text-slate-300 sm:block" />
        <a
          href={projectHref}
          className={`hidden max-w-44 truncate rounded text-xs font-medium text-drift-muted transition hover:text-drift-ink md:inline ${FOCUS_RING}`}
        >
          {projectName ?? 'Project'}
        </a>
        <ChevronRightIcon className="hidden size-3.5 shrink-0 text-slate-300 md:block" />
        <h1 title={name} className="min-w-0 truncate text-sm font-semibold tracking-[-0.02em] text-drift-ink sm:text-[15px]">
          {name}
        </h1>
        <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-drift-muted sm:inline">
          {roleLabel(role)}
        </span>
      </nav>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <PresenceAvatars presence={presence} currentUserId={currentUserId} />
        <SyncStatus
          online={online}
          authLost={authLost}
          simOffline={simOffline}
          pending={pending}
          sending={sending}
          syncError={syncError}
          wsStatus={wsStatus}
          onOpen={onOpenInspector}
        />
        <div className="hidden items-center md:flex">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
            className={`${ICON_BUTTON} size-9 disabled:cursor-not-allowed disabled:opacity-35`}
          >
            <UndoIcon className="size-[18px]" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Shift+Ctrl/Cmd+Z)"
            className={`${ICON_BUTTON} size-9 disabled:cursor-not-allowed disabled:opacity-35`}
          >
            <RedoIcon className="size-[18px]" />
          </button>
        </div>
        <ToolbarMenu
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onCopyLink={onCopyLink}
          simOffline={simOffline}
          onSimOfflineChange={onSimOfflineChange}
        />
        <button
          type="button"
          id="board-inspector-toggle"
          onClick={onToggleInspector}
          aria-label={inspectorOpen ? 'Hide board details' : 'Show board details'}
          aria-expanded={inspectorOpen}
          aria-controls="board-inspector"
          className={`${ICON_BUTTON} size-9 ${inspectorOpen ? 'bg-slate-100 text-drift-ink' : ''}`}
        >
          <PanelRightIcon className="size-[18px]" />
        </button>
        <AccountMenu user={user} />
      </div>
    </header>
  );
}
