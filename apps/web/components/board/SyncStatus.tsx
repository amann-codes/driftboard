'use client';

import type { WebSocketStatus } from '@/lib/use-board';
import { FOCUS_RING } from '@/components/workspace/styles';

type Props = {
  online: boolean;
  authLost: boolean;
  simOffline: boolean;
  pending: number;
  sending: number;
  syncError: string;
  wsStatus: WebSocketStatus;
  onOpen: () => void;
};

const TONES = {
  ok: 'bg-emerald-500',
  pending: 'bg-amber-500',
  error: 'bg-red-500',
  neutral: 'bg-slate-400',
};

export default function SyncStatus({
  online,
  authLost,
  simOffline,
  pending,
  sending,
  syncError,
  wsStatus,
  onOpen,
}: Props) {
  let tone: keyof typeof TONES = 'ok';
  let label = 'Synced';
  let detail = 'All changes are on the server.';

  if (authLost) {
    tone = 'error';
    label = 'Session expired';
    detail = 'Sign in again to sync changes. Your work is saved on this device.';
  } else if (!online) {
    tone = 'pending';
    label = simOffline ? 'Offline (simulated)' : 'Offline';
    detail = pending
      ? `${pending} change${pending === 1 ? '' : 's'} saved on this device.`
      : 'Changes will sync when the connection returns.';
  } else if (syncError) {
    tone = 'error';
    label = 'Sync issue';
    detail = syncError;
  } else if (pending > 0) {
    tone = 'pending';
    label = sending > 0 ? `Syncing ${pending}` : `${pending} pending`;
    detail = sending > 0 ? 'Sending your changes to the server.' : 'Waiting to send your changes.';
  } else if (wsStatus === 'connecting') {
    tone = 'neutral';
    label = 'Connecting live';
    detail = 'Changes are saved. Connecting for realtime updates.';
  } else if (wsStatus === 'reconnecting') {
    tone = 'pending';
    label = 'Live reconnecting';
    detail = 'Changes still sync over HTTP. Reconnecting for live updates.';
  } else if (wsStatus === 'offline') {
    tone = 'neutral';
    label = 'Synced';
    detail = 'Board changes are synced.';
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Sync status: ${label}. ${detail}`}
      title={detail}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-xs font-medium text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
    >
      <span className={`size-2 shrink-0 rounded-full ${TONES[tone]}`} aria-hidden />
      <span className="hidden whitespace-nowrap sm:inline">{label}</span>
    </button>
  );
}
