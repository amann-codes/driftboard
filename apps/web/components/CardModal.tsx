'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CommittedOp, OpInput, SyncClient, describeOp, prettyField } from '@driftboard/shared';
import { api } from '@/lib/api';
import type { Member } from '@/lib/use-board';
import { tintFor } from '@/lib/workspace';
import Avatar from './Avatar';
import Dialog from './workspace/Dialog';
import { CloseIcon, PlusIcon } from './workspace/icons';
import { DANGER_BUTTON, FIELD_LABEL, FOCUS_RING, INPUT, SECONDARY_BUTTON } from './workspace/styles';
import Markdown from './Markdown';
import { ArchiveIcon, RestoreIcon } from './board/icons';

type Props = {
  boardId: string;
  card: Card;
  client: SyncClient;
  members: Member[];
  readOnly: boolean;
  online: boolean;
  editors: { userId: string; name: string }[];
  run: (input: OpInput) => void;
  onClose: () => void;
};

type HistoryRow = CommittedOp & { actorName: string };

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const preview = (value: unknown) => {
  const text = show(value);
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
};

export default function CardModal({
  boardId,
  card,
  client,
  members,
  readOnly,
  online,
  editors,
  run,
  onClose,
}: Props) {
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.description);
  const [tab, setTab] = useState<'preview' | 'write'>(card.description ? 'preview' : 'write');
  const [label, setLabel] = useState('');
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement?.id !== 'card-title') setTitle(card.title);
  }, [card.title]);

  useEffect(() => {
    if (document.activeElement?.id !== 'card-desc') setDesc(card.description);
  }, [card.description]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError('');
    api<HistoryRow[]>(`/api/boards/${boardId}/cards/${card.id}/history`)
      .then(rows => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryError("We couldn't load this card's activity.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, card.id, online, client.confirmed.seq]);

  const set = (field: 'title' | 'description' | 'assigneeId' | 'dueDate' | 'archived', value: unknown) => {
    if (JSON.stringify((card as any)[field]) === JSON.stringify(value)) return;
    run({ type: 'card.set', cardId: card.id, field, value });
  };

  const nameOf = (id: string) => members.find(member => member.id === id)?.name ?? 'Someone';
  const lost = client.lostEdits.filter(edit => edit.cardId === card.id);
  const myPending = client.pending.filter(op => (op as any).cardId === card.id);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Card details"
      size="xl"
      initialFocusRef={readOnly ? undefined : titleRef}
    >
      <div className="flex flex-wrap items-center gap-2">
        {card.archived && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-drift-muted">
            Archived
          </span>
        )}
        {myPending.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
            {myPending.length} change{myPending.length === 1 ? '' : 's'} pending
          </span>
        )}
        {lost.length > 0 && (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">
            {lost.length} replaced edit{lost.length === 1 ? '' : 's'}
          </span>
        )}
        {editors.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-drift-muted">
            <span className="flex -space-x-1">
              {editors.map(editor => (
                <span key={editor.userId} className="rounded-full ring-2 ring-white" title={`${editor.name} is editing`}>
                  <Avatar id={editor.userId} name={editor.name} className="size-5 text-[8px]" />
                </span>
              ))}
            </span>
            editing now
          </span>
        )}
      </div>

      {readOnly ? (
        <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-drift-ink [overflow-wrap:anywhere]">{card.title}</h2>
      ) : (
        <input
          ref={titleRef}
          id="card-title"
          value={title}
          maxLength={200}
          aria-label="Card title"
          onChange={event => setTitle(event.target.value)}
          onBlur={() => (title.trim() ? set('title', title.trim()) : setTitle(card.title))}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="mt-3 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-[-0.02em] text-drift-ink outline-none transition hover:border-drift-line focus:border-drift-accent focus:bg-white focus:ring-2 focus:ring-drift-accent/20"
        />
      )}

      {lost.map(edit => (
        <div key={edit.seq} className="mt-3 rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm">
          <p className="font-medium text-red-900">
            Your {prettyField(edit.field)} edit was replaced by {nameOf(edit.winnerId)}&apos;s newer edit.
          </p>
          <p className="mt-1 text-xs leading-5 text-red-800">Your version: {show(edit.loserValue)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!readOnly && ['title', 'description', 'assigneeId', 'dueDate'].includes(edit.field) && (
              <button
                type="button"
                onClick={() => {
                  set(edit.field as 'title' | 'description' | 'assigneeId' | 'dueDate', edit.loserValue);
                  client.dismissLostEdit(edit.seq);
                }}
                className={`${SECONDARY_BUTTON} h-8 px-3 text-xs`}
              >
                Use mine
              </button>
            )}
            <button type="button" onClick={() => client.dismissLostEdit(edit.seq)} className={`${SECONDARY_BUTTON} h-8 px-3 text-xs`}>
              Dismiss
            </button>
          </div>
        </div>
      ))}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="card-assignee" className={FIELD_LABEL}>
            Assignee
          </label>
          <select
            id="card-assignee"
            value={card.assigneeId ?? ''}
            disabled={readOnly}
            onChange={event => set('assigneeId', event.target.value || null)}
            className={`${INPUT} mt-2 disabled:bg-slate-50 disabled:text-drift-muted`}
          >
            <option value="">Unassigned</option>
            {members.map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="card-due-date" className={FIELD_LABEL}>
            Due date
          </label>
          <input
            id="card-due-date"
            type="date"
            value={card.dueDate ?? ''}
            disabled={readOnly}
            onChange={event => set('dueDate', event.target.value || null)}
            className={`${INPUT} mt-2 disabled:bg-slate-50 disabled:text-drift-muted`}
          />
        </div>
      </div>

      <div className="mt-5">
        <p className={FIELD_LABEL}>Labels</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.labels.length === 0 && <span className="text-xs text-drift-muted">No labels yet.</span>}
          {card.labels.map(item => (
            <span key={item} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tintFor(item)}`}>
              {item}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => run({ type: 'card.label', cardId: card.id, label: item, on: false })}
                  aria-label={`Remove label ${item}`}
                  className={`grid size-4 place-items-center rounded-full border-0 bg-transparent p-0 transition hover:bg-black/5 ${FOCUS_RING}`}
                >
                  <CloseIcon className="size-3" />
                </button>
              )}
            </span>
          ))}
          {!readOnly && (
            <form
              className="inline-flex items-center gap-1"
              onSubmit={event => {
                event.preventDefault();
                const next = label.trim();
                if (next) run({ type: 'card.label', cardId: card.id, label: next, on: true });
                setLabel('');
              }}
            >
              <input
                value={label}
                maxLength={32}
                aria-label="Add label"
                placeholder="Add label"
                onChange={event => setLabel(event.target.value)}
                className="h-8 w-28 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 text-xs text-drift-ink outline-none placeholder:text-slate-400 focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20"
              />
              <button type="submit" disabled={!label.trim()} aria-label="Add label" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent p-0 text-drift-muted transition hover:bg-slate-100 hover:text-drift-ink disabled:opacity-40">
                <PlusIcon className="size-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-drift-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={FIELD_LABEL}>Description</p>
          {!readOnly && (
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {(['write', 'preview'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTab(mode)}
                  aria-pressed={tab === mode}
                  className={`rounded-md border-0 bg-transparent px-3 py-1.5 text-xs font-medium capitalize transition ${
                    tab === mode ? 'bg-white text-drift-ink shadow-sm' : 'text-drift-muted hover:text-drift-ink'
                  } ${FOCUS_RING}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </div>

        {!readOnly && tab === 'write' ? (
          <textarea
            id="card-desc"
            rows={9}
            value={desc}
            maxLength={20000}
            aria-label="Card description"
            placeholder="Add context, links, checklists, or notes…"
            onChange={event => setDesc(event.target.value)}
            onBlur={() => set('description', desc)}
            className="mt-3 w-full resize-y rounded-xl border border-drift-line bg-white px-3.5 py-3 text-sm leading-6 text-drift-ink outline-none transition placeholder:text-slate-400 focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20"
          />
        ) : (
          <div className="mt-3 min-h-24 rounded-xl border border-drift-line bg-slate-50/70 px-4 py-3">
            <Markdown text={desc} />
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-drift-line pt-5">
          {card.archived ? (
            <button type="button" onClick={() => set('archived', false)} className={`${SECONDARY_BUTTON} h-9 px-3 text-xs`}>
              <RestoreIcon className="size-3.5" />
              Restore card
            </button>
          ) : (
            <button type="button" onClick={() => set('archived', true)} className={`${DANGER_BUTTON} h-9 px-3 text-xs`}>
              <ArchiveIcon className="size-3.5" />
              Archive card
            </button>
          )}
        </div>
      )}

      <section aria-labelledby="card-activity-heading" className="mt-6 border-t border-drift-line pt-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="card-activity-heading" className="text-sm font-semibold text-drift-ink">
            Activity
          </h3>
          {!online && <span className="text-[11px] text-drift-muted">History loads when you reconnect.</span>}
        </div>

        {myPending.length > 0 && (
          <ul className="mt-3 space-y-2">
            {myPending.map(op => (
              <li key={op.opId} className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Not synced yet: {describeOp(op, client.view)} · made {new Date(op.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}

        {online && historyLoading && !history && (
          <div className="mt-3 space-y-2" aria-label="Loading card activity">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
        )}

        {online && historyError && !historyLoading && (
          <p className="mt-3 text-xs text-drift-muted">{historyError}</p>
        )}

        {history && history.length === 0 && <p className="mt-3 text-xs text-drift-muted">No activity yet.</p>}

        {history && history.length > 0 && (
          <ol className="mt-3 space-y-2.5">
            {[...history].reverse().map(row => (
              <HistoryLine key={row.seq} row={row} nameOf={nameOf} />
            ))}
          </ol>
        )}
      </section>
    </Dialog>
  );
}

function HistoryLine({ row, nameOf }: { row: HistoryRow; nameOf: (id: string) => string }) {
  const made = new Date(row.createdAt);
  const received = new Date(row.receivedAt);
  const offline = row.receivedAt - row.createdAt > 10_000;
  let what: string;

  switch (row.type) {
    case 'card.create':
      what = `created the card “${row.data.title}”`;
      break;
    case 'card.set':
      what = `changed ${prettyField(row.data.field)} from “${preview(row.before)}” to “${preview(row.data.value)}”`;
      break;
    case 'card.label':
      what = `${row.data.on ? 'added' : 'removed'} label “${row.data.label}”`;
      break;
    case 'card.move':
      what = 'moved the card';
      break;
    case 'column.delete':
      what = 'deleted its list and archived the card';
      break;
    default:
      what = row.type;
  }

  return (
    <li className="flex gap-2">
      <Avatar id={row.actorId} name={row.actorName} className="size-6 shrink-0 text-[9px]" />
      <div className="min-w-0 text-xs leading-5 text-drift-body">
        <p>
          <strong className="font-semibold text-drift-ink">{row.actorName}</strong> {what}
          {!row.applied && ' (lost to a newer edit)'}
          {row.conflict && row.applied && ` (replaced ${nameOf(row.conflict.loserId)}'s “${preview(row.conflict.loserValue)}”)`}
        </p>
        <p className="mt-0.5 text-[10px] leading-4 text-drift-muted">
          {offline
            ? `Made offline ${made.toLocaleString()} · reached server ${received.toLocaleString()}`
            : received.toLocaleString()}
        </p>
      </div>
    </li>
  );
}
