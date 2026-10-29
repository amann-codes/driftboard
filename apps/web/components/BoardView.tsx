'use client';
// The board screen: columns, cards, drag-and-drop (dnd-kit), presence, undo keys,
// and the side panel that lists every change that hasn't synced yet.
import { useEffect, useMemo, useState } from 'react';
import { Card, OpInput, cardsInColumn, describeOp, keyBetween, liveColumns, placementInput } from '@driftboard/shared';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoard } from '@/lib/use-board';
import Avatar from './Avatar';
import CardModal from './CardModal';

type DragKind = 'card' | 'column';
type DragItem = { kind: DragKind; cardId?: string; columnId: string } | null;

const cardKey = (id: string) => `card:${id}`;
const columnKey = (id: string) => `column:${id}`;

export default function BoardView({ boardId }: { boardId: string }) {
  const b = useBoard(boardId);
  const [active, setActive] = useState<DragItem>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideDrawer, setSideDrawer] = useState(false); // panel floats over the board
  const [sideBackdrop, setSideBackdrop] = useState(false); // …with a click-to-close backdrop (small screens)

  const view = b.view;
  const readOnly = b.meta?.role === 'VIEWER';

  // 6px activation distance so a plain click still opens a card / hits a button.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  // Cmd/Ctrl+Z = undo, Shift+Cmd/Ctrl+Z = redo (my own actions only).
  // Inside a text field we leave the browser's own text undo alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || !b.undo) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      const r = e.shiftKey ? b.undo.redo() : b.undo.undo();
      if (!r.ok) b.notify({ kind: 'info', message: r.message });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [b.undo, b.notify]);

  useEffect(() => {
    b.setEditing(openCard);
  }, [openCard, b.setEditing]);

  // Below this width the side panel becomes a right-hand drawer so it doesn't
  // squeeze the board into a single column. Below 800px it also gets a backdrop;
  // in the 801–1100px band the drawer floats so the board stays fully usable.
  useEffect(() => {
    const drawer = window.matchMedia('(max-width: 1100px)');
    const backdrop = window.matchMedia('(max-width: 800px)');
    const update = () => {
      setSideDrawer(drawer.matches);
      setSideBackdrop(backdrop.matches);
      if (drawer.matches) setSideOpen(false);
    };
    update();
    drawer.addEventListener('change', update);
    backdrop.addEventListener('change', update);
    return () => {
      drawer.removeEventListener('change', update);
      backdrop.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (!sideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSideOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sideOpen]);

  // Which cards have changes still waiting to sync (shown as an orange edge + "unsynced").
  const pendingByCard = useMemo(() => {
    const map = new Map<string, number>();
    for (const op of b.client?.pending ?? []) {
      const id = (op as any).cardId as string | undefined;
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [b.client?.pending]);

  const editorsByCard = useMemo(() => {
    const map = new Map<string, { userId: string; name: string }[]>();
    for (const u of b.presence) {
      for (const cardId of u.editing) map.set(cardId, [...(map.get(cardId) ?? []), u]);
    }
    return map;
  }, [b.presence]);

  if (b.status === 'loading') return <div className="page">Loading board…</div>;
  if (b.status === 'locked') return <div className="page">This board is already open in another tab. Close it there, then reload.</div>;
  if (b.status === 'error' || !view || !b.client) {
    return (
      <div className="page">
        <p>{b.error || 'Could not load board.'}</p>
        <a href="/dashboard/">Back to dashboard</a>
      </div>
    );
  }

  const columns = liveColumns(view);
  const memberName = (id: string | null) => b.meta?.members.find(m => m.id === id)?.name ?? 'Unknown';
  const run = (input: OpInput) => b.run(input);

  const tileProps = (card: Card) => ({
    card,
    pending: pendingByCard.get(card.id) ?? 0,
    editors: (editorsByCard.get(card.id) ?? []).filter(u => u.userId !== b.client!.actorId),
    assignee: card.assigneeId ? memberName(card.assigneeId) : null,
    hasConflict: b.client!.lostEdits.some(l => l.cardId === card.id),
    onOpen: () => setOpenCard(card.id),
  });

  const onDragStart = (e: DragStartEvent) => {
    setActive((e.active.data.current as DragItem) ?? null);
    setOverColumnId(null);
  };

  const onDragOver = (e: DragOverEvent) => {
    const d = e.over?.data.current as DragItem | undefined;
    setOverColumnId(d ? d.columnId : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const from = e.active.data.current as DragItem | undefined;
    const over = e.over?.data.current as DragItem | undefined;
    setActive(null);
    setOverColumnId(null);
    if (!from || !over || readOnly) return;

    // Drop position: is the dragged item's centre below the over item's centre?
    const translated = e.active.rect.current.translated;
    const below = !!translated && translated.top + translated.height / 2 > e.over!.rect.top + e.over!.rect.height / 2;

    if (from.kind === 'card' && from.cardId) {
      const cardId = from.cardId;
      const card = view.cards[cardId];
      if (!card) return;
      const targetColumnId = over.columnId;
      const siblings = cardsInColumn(view, targetColumnId).filter(c => c.id !== cardId);
      let index: number;
      if (over.kind === 'card' && over.cardId) {
        const overIdx = siblings.findIndex(c => c.id === over.cardId);
        if (overIdx < 0) return;
        index = overIdx + (below ? 1 : 0);
      } else {
        // Dropped on the column itself (empty area / below the list): end of column.
        index = siblings.length;
      }
      // No-op guard: same column, same visual slot.
      const cur = cardsInColumn(view, targetColumnId);
      const curIdx = cur.findIndex(c => c.id === cardId);
      const left = siblings[index - 1]?.id ?? null;
      const right = siblings[index]?.id ?? null;
      if (card.columnId === targetColumnId && left === (cur[curIdx - 1]?.id ?? null) && right === (cur[curIdx + 1]?.id ?? null)) return;
      run(placementInput(cardId, targetColumnId, siblings, index));
      return;
    }

    if (from.kind === 'column' && over.kind === 'column') {
      const columnId = from.columnId;
      if (over.columnId === columnId) return;
      const others = columns.filter(c => c.id !== columnId);
      const idx = others.findIndex(c => c.id === over.columnId) + (below ? 1 : 0);
      const left = others[idx - 1] ?? null;
      const right = others[idx] ?? null;
      const pos = left && right && left.pos === right.pos ? left.pos : keyBetween(left?.pos ?? null, right?.pos ?? null);
      run({ type: 'column.move', columnId, pos, afterId: left?.id ?? null, beforeId: right?.id ?? null });
    }
  };

  const addCard = (columnId: string, title: string) => {
    const siblings = cardsInColumn(view, columnId);
    const last = siblings[siblings.length - 1];
    run({ type: 'card.create', cardId: crypto.randomUUID(), columnId, pos: keyBetween(last?.pos ?? null, null), afterId: last?.id ?? null, beforeId: null, title });
  };

  const addColumn = () => {
    const name = prompt('Column name');
    if (!name?.trim()) return;
    const all = Object.values(view.columns).sort((a, c) => (a.pos < c.pos ? -1 : 1));
    run({ type: 'column.create', columnId: crypto.randomUUID(), name: name.trim(), pos: keyBetween(all[all.length - 1]?.pos ?? null, null) });
  };

  const pending = b.client.pending;
  const statusColor = b.online ? (pending.length ? 'var(--warn)' : 'var(--ok)') : 'var(--danger)';

  return (
    <div className="board-shell">
      <div className="topbar">
        <a href="/dashboard/" aria-label="Back to dashboard">←</a>
        <h1>{view.name}</h1>
        <span className="pill">{b.meta?.role}</span>
        <span className="spacer" />
        <div className="avatars" title="Viewing this board">
          {b.presence.map(u => (
            <Avatar key={u.userId} id={u.userId} name={u.name} title={`${u.name}${u.editing.length ? ' (editing)' : ''}`} />
          ))}
        </div>
        <span className="muted">
          <span className="status-dot" style={{ background: statusColor }} />
          {b.authLost
            ? 'Session expired: sign in again; your changes are kept'
            : !b.online
              ? `Offline · ${pending.length} change(s) saved on this device`
              : pending.length
                ? `Syncing ${pending.length}…`
                : 'All changes synced'}
        </span>
        <label className="muted row" style={{ gap: 4 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={b.simOffline} onChange={e => b.setSimOffline(e.target.checked)} />
          Simulate offline
        </label>
        <button disabled={!b.undo?.canUndo} onClick={() => { const r = b.undo!.undo(); if (!r.ok) b.notify({ kind: 'info', message: r.message }); }}>
          Undo
        </button>
        <button disabled={!b.undo?.canRedo} onClick={() => { const r = b.undo!.redo(); if (!r.ok) b.notify({ kind: 'info', message: r.message }); }}>
          Redo
        </button>
        <button aria-expanded={sideOpen} aria-controls="board-side-panel" onClick={() => setSideOpen(v => !v)} title="Show or hide the sync activity panel">
          {sideOpen ? 'Hide panel' : 'Activity'}
        </button>
      </div>

      <div className="layout">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); setOverColumnId(null); }}>
          <div className="columns">
            <SortableContext items={columns.map(c => columnKey(c.id))} strategy={horizontalListSortingStrategy}>
              {columns.map(col => {
                const cards = cardsInColumn(view, col.id);
                return (
                  <BoardColumn
                    key={col.id}
                    id={col.id}
                    name={col.name}
                    count={cards.length}
                    readOnly={readOnly}
                    dropTarget={overColumnId === col.id && active?.kind === 'card'}
                    onRename={name => run({ type: 'column.rename', columnId: col.id, name })}
                    onDelete={() => {
                      if (confirm(`Delete "${col.name}"? Its cards will be archived (restorable).`)) run({ type: 'column.delete', columnId: col.id });
                    }}
                    onAddCard={title => addCard(col.id, title)}
                  >
                    <SortableContext items={cards.map(c => cardKey(c.id))} strategy={verticalListSortingStrategy}>
                      {cards.map(card => (
                        <SortableCardTile key={card.id} disabled={readOnly} {...tileProps(card)} />
                      ))}
                    </SortableContext>
                  </BoardColumn>
                );
              })}
            </SortableContext>
            {!readOnly && (
              <button style={{ flexShrink: 0, alignSelf: 'flex-start' }} onClick={addColumn}>
                + Column
              </button>
            )}
          </div>

          <DragOverlay>
            {active?.kind === 'card' && view.cards[active.cardId!] ? (
              <div className="drag-ghost">
                <CardTile {...tileProps(view.cards[active.cardId!])} />
              </div>
            ) : active?.kind === 'column' ? (
              <div className="column drag-ghost-column">
                <div className="column-head">{view.columns[active.columnId]?.name}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {sideOpen && sideBackdrop && <div className="side-backdrop" onClick={() => setSideOpen(false)} />}
        {sideOpen && (
          <aside className={`side ${sideDrawer ? 'drawer' : ''}`} id="board-side-panel">
            <div className="row side-head">
              <h3 style={{ margin: 0 }}>Activity</h3>
              <button style={{ padding: '0 8px' }} onClick={() => setSideOpen(false)} aria-label="Close panel">
                ×
              </button>
            </div>
            <h3>Not synced yet ({pending.length})</h3>
            {pending.length === 0 && <p className="muted">Everything is on the server.</p>}
            {pending.map(op => (
              <div key={op.opId} className={`change ${b.client!.sending.has(op.opId) ? 'sending' : ''}`}>
                <div>{describeOp(op, view)}</div>
                <div className="muted">
                  {b.client!.sending.has(op.opId) ? 'Sending…' : b.online ? 'Queued' : 'Waiting for network'} · made {new Date(op.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
            <h3>Archived cards</h3>
            {Object.values(view.cards)
              .filter(c => c.archived)
              .slice(0, 30)
              .map(c => (
                <div key={c.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <a href="#" onClick={e => (e.preventDefault(), setOpenCard(c.id))}>
                    {c.title}
                  </a>
                  {!readOnly && <button onClick={() => run({ type: 'card.set', cardId: c.id, field: 'archived', value: false })}>Restore</button>}
                </div>
              ))}
          </aside>
        )}
      </div>

      {openCard && view.cards[openCard] && (
        <CardModal
          boardId={boardId}
          card={view.cards[openCard]}
          client={b.client}
          members={b.meta?.members ?? []}
          readOnly={readOnly}
          online={b.online}
          editors={(editorsByCard.get(openCard) ?? []).filter(u => u.userId !== b.client!.actorId)}
          run={run}
          onClose={() => setOpenCard(null)}
        />
      )}

      <div className="toasts">
        {b.notices.map(n => (
          <div key={n.id} className={`toast ${n.kind}`}>
            <span style={{ flex: 1 }}>{n.message}</span>
            <button style={{ padding: '0 6px' }} onClick={() => b.dismissNotice(n.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardColumn(props: {
  id: string;
  name: string;
  count: number;
  readOnly: boolean;
  dropTarget: boolean;
  onRename: (n: string) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  children: React.ReactNode;
}) {
  // Drag by the header only; the column itself is also a drop target for cards.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnKey(props.id),
    data: { kind: 'column', columnId: props.id } satisfies DragItem,
    disabled: props.readOnly,
  });
  return (
    <div
      ref={setNodeRef}
      className={`column ${props.dropTarget ? 'drop-target' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ColumnHeader
        name={props.name}
        count={props.count}
        readOnly={props.readOnly}
        dragHandleProps={props.readOnly ? undefined : { ...attributes, ...listeners }}
        onRename={props.onRename}
        onDelete={props.onDelete}
      />
      <div className="cards">{props.children}</div>
      {!props.readOnly && <AddCard onAdd={props.onAddCard} />}
    </div>
  );
}

function SortableCardTile(props: {
  card: Card;
  pending: number;
  editors: { userId: string; name: string }[];
  assignee: string | null;
  hasConflict: boolean;
  onOpen: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey(props.card.id),
    data: { kind: 'card', cardId: props.card.id, columnId: props.card.columnId } satisfies DragItem,
    disabled: props.disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <CardTile
        card={props.card}
        pending={props.pending}
        editors={props.editors}
        assignee={props.assignee}
        hasConflict={props.hasConflict}
        onOpen={props.onOpen}
      />
    </div>
  );
}

function ColumnHeader(props: {
  name: string;
  count: number;
  readOnly: boolean;
  dragHandleProps?: Record<string, unknown>;
  onRename: (n: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.name);
  useEffect(() => setValue(props.name), [props.name]);
  return (
    <div className="column-head" style={{ cursor: props.dragHandleProps ? 'grab' : 'default' }} {...props.dragHandleProps}>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (value.trim() && value !== props.name) props.onRename(value.trim());
          }}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span style={{ flex: 1 }} onDoubleClick={() => !props.readOnly && setEditing(true)}>
          {props.name} <span className="muted">{props.count}</span>
        </span>
      )}
      {!props.readOnly && !editing && (
        <button
          style={{ padding: '0 6px' }}
          title="Delete column"
          onClick={props.onDelete}
          onPointerDown={e => e.stopPropagation()} // don't start a column drag from the delete button
        >
          ×
        </button>
      )}
    </div>
  );
}

function CardTile(props: {
  card: Card;
  pending: number;
  editors: { userId: string; name: string }[];
  assignee: string | null;
  hasConflict: boolean;
  onOpen: () => void;
}) {
  const { card } = props;
  return (
    <div className={`tile ${props.pending ? 'pending' : ''}`} onClick={props.onOpen}>
      {props.editors.length > 0 && (
        <div className="editing-badge" title="Editing now">
          {props.editors.map(u => (
            <Avatar key={u.userId} id={u.userId} name={u.name} title={`${u.name} is editing`} />
          ))}
        </div>
      )}
      <div className="title">{card.title}</div>
      <div className="meta">
        {card.labels.map(l => (
          <span key={l} className="label">
            {l}
          </span>
        ))}
        {card.dueDate && <span className="muted">📅 {card.dueDate}</span>}
        {card.description && <span className="muted">≡</span>}
        {props.assignee && <span className="muted">@{props.assignee.split(' ')[0]}</span>}
        {props.hasConflict && <span title="One of your edits was replaced">⚠️</span>}
        {props.pending > 0 && <span className="unsynced">● unsynced ({props.pending})</span>}
      </div>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <form
      style={{ marginTop: 8 }}
      onSubmit={e => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd(title.trim());
        setTitle('');
      }}
    >
      <input value={title} placeholder="+ Add a card" onChange={e => setTitle(e.target.value)} />
    </form>
  );
}
