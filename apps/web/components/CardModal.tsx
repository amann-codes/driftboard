'use client';
// Card details: edit every field, see who else is editing, see edits of yours that lost
// a conflict (with "use mine"), and the card's activity log.
import { useEffect, useState } from 'react';
import { Card, CommittedOp, OpInput, SyncClient, prettyField } from '@driftboard/shared';
import { api } from '@/lib/api';
import type { Member } from '@/lib/use-board';
import Avatar from './Avatar';
import Markdown from './Markdown';

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

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

export default function CardModal({ boardId, card, client, members, readOnly, online, editors, run, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.description);
  const [tab, setTab] = useState<'preview' | 'write'>('preview');
  const [label, setLabel] = useState('');
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  // Someone else's change arrives while the modal is open: refresh the inputs we're not typing in.
  useEffect(() => {
    if (document.activeElement?.id !== 'card-title') setTitle(card.title);
  }, [card.title]);
  useEffect(() => {
    if (document.activeElement?.id !== 'card-desc') setDesc(card.description);
  }, [card.description]);

  useEffect(() => {
    if (!online) return;
    api<HistoryRow[]>(`/api/boards/${boardId}/cards/${card.id}/history`)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, [boardId, card.id, online, client.confirmed.seq]);

  const set = (field: 'title' | 'description' | 'assigneeId' | 'dueDate' | 'archived', value: unknown) => {
    if (JSON.stringify((card as any)[field]) === JSON.stringify(value)) return;
    run({ type: 'card.set', cardId: card.id, field, value });
  };

  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? 'Someone';
  const lost = client.lostEdits.filter(l => l.cardId === card.id);
  const myPending = client.pending.filter(p => (p as any).cardId === card.id);

  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row">
          {card.archived && <span className="pill" style={{ background: '#ffe3e3' }}>Archived</span>}
          <span className="spacer" />
          {editors.map(u => (
            <span key={u.userId} className="row muted" style={{ gap: 4 }}>
              <Avatar id={u.userId} name={u.name} /> editing
            </span>
          ))}
          <button onClick={onClose}>Close</button>
        </div>

        <input
          id="card-title"
          style={{ fontSize: 20, fontWeight: 700, border: 'none', padding: '8px 0' }}
          value={title}
          disabled={readOnly}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => (title.trim() ? set('title', title.trim()) : setTitle(card.title))}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />

        {lost.map(l => (
          <div key={l.seq} className="conflict">
            <strong>Your {prettyField(l.field)} edit was replaced</strong> by {nameOf(l.winnerId)}&apos;s newer edit.
            <div className="muted">Your version: {show(l.loserValue)}</div>
            <div className="row" style={{ marginTop: 6 }}>
              {!readOnly && ['title', 'description', 'assigneeId', 'dueDate'].includes(l.field) && (
                <button
                  onClick={() => {
                    set(l.field as any, l.loserValue);
                    client.dismissLostEdit(l.seq);
                  }}
                >
                  Use mine
                </button>
              )}
              <button onClick={() => client.dismissLostEdit(l.seq)}>Dismiss</button>
            </div>
          </div>
        ))}

        <div className="grid2">
          <div>
            <label className="field-label">Assignee</label>
            <select value={card.assigneeId ?? ''} disabled={readOnly} onChange={e => set('assigneeId', e.target.value || null)}>
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Due date</label>
            <input type="date" value={card.dueDate ?? ''} disabled={readOnly} onChange={e => set('dueDate', e.target.value || null)} />
          </div>
        </div>

        <label className="field-label">Labels</label>
        <div className="row">
          {card.labels.map(l => (
            <span key={l} className="label">
              {l}{' '}
              {!readOnly && (
                <a href="#" onClick={e => (e.preventDefault(), run({ type: 'card.label', cardId: card.id, label: l, on: false }))}>
                  ×
                </a>
              )}
            </span>
          ))}
          {!readOnly && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (label.trim()) run({ type: 'card.label', cardId: card.id, label: label.trim(), on: true });
                setLabel('');
              }}
            >
              <input style={{ width: 140 }} placeholder="add label" value={label} onChange={e => setLabel(e.target.value)} />
            </form>
          )}
        </div>

        <label className="field-label">Description (Markdown)</label>
        {!readOnly && (
          <div className="row tabs" style={{ marginBottom: 6 }}>
            <button className={tab === 'write' ? 'active' : ''} onClick={() => setTab('write')}>
              Write
            </button>
            <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>
              Preview
            </button>
          </div>
        )}
        {tab === 'write' && !readOnly ? (
          <textarea id="card-desc" rows={12} value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => set('description', desc)} />
        ) : (
          <Markdown text={card.description} />
        )}

        {!readOnly && (
          <div className="row" style={{ marginTop: 16 }}>
            {card.archived ? (
              <button onClick={() => set('archived', false)}>Restore card</button>
            ) : (
              <button className="danger" onClick={() => set('archived', true)}>
                Archive card
              </button>
            )}
          </div>
        )}

        <div className="history">
          <strong>Activity</strong>
          {myPending.length > 0 && (
            <ul>
              {myPending.map(p => (
                <li key={p.opId} className="unsynced">
                  Not synced yet: {p.type} (made {new Date(p.createdAt).toLocaleString()})
                </li>
              ))}
            </ul>
          )}
          {!online && <p className="muted">History loads when you are online.</p>}
          {history && (
            <ul>
              {[...history].reverse().map(h => (
                <li key={h.seq}>
                  <HistoryLine h={h} nameOf={nameOf} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryLine({ h, nameOf }: { h: HistoryRow; nameOf: (id: string) => string }) {
  const made = new Date(h.createdAt);
  const received = new Date(h.receivedAt);
  // More than 10s between "made" and "reached server" = it was made offline (or on a very slow link).
  const offline = h.receivedAt - h.createdAt > 10_000;
  let what: string;
  switch (h.type) {
    case 'card.create':
      what = `created the card "${h.data.title}"`;
      break;
    case 'card.set':
      what = `changed ${prettyField(h.data.field)} from "${show(h.before)}" to "${show(h.data.value)}"`;
      break;
    case 'card.label':
      what = `${h.data.on ? 'added' : 'removed'} label "${h.data.label}"`;
      break;
    case 'card.move':
      what = 'moved the card';
      break;
    case 'column.delete':
      what = 'deleted its column (card archived)';
      break;
    default:
      what = h.type;
  }
  return (
    <span>
      <strong>{h.actorName}</strong> {what}
      {!h.applied && ' (lost to a newer edit)'}
      {h.conflict && h.applied && ` (replaced ${nameOf(h.conflict.loserId)}'s "${show(h.conflict.loserValue)}")`}
      <div className="muted">
        {offline ? `made offline ${made.toLocaleString()} · reached server ${received.toLocaleString()}` : received.toLocaleString()}
      </div>
    </span>
  );
}
