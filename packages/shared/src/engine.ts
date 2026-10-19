// The heart of Driftboard. Two pure functions shared by the server and every client:
//
//   commit(state, op)        -> server rules: permissions, validation, conflicts, placement.
//                               Turns one ClientOp into one or more CommittedOps.
//   applyCommitted(state, c) -> the reducer. Applies an already-decided CommittedOp.
//
// The server runs commit() for real. Clients run the same commit() on top of their
// confirmed state to show optimistic results, then replace them with what the server decided.
import { Positioned, keyBetween, needsRebalance, rebalance, sortPositioned, comparePositioned } from './fracindex';
import { CardField, ClientOp, CommittedOp, Conflict, validFieldValue } from './ops';

export type FieldMeta = { hlc: string; by: string };
export type Meta = Record<string, FieldMeta>; // per-field "who wrote it last, when"

export type Card = {
  id: string;
  columnId: string;
  pos: string;
  title: string;
  description: string;
  assigneeId: string | null;
  labels: string[];
  dueDate: string | null;
  archived: boolean;
  createdBy: string;
  meta: Meta;
};

export type Column = {
  id: string;
  name: string;
  pos: string;
  deleted: boolean;
  meta: Meta;
};

export type BoardState = {
  id: string;
  name: string;
  seq: number; // last applied log position
  columns: Record<string, Column>;
  cards: Record<string, Card>;
};

export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

export type CommitCtx = {
  actorId: string;
  role: Role;
  nextSeq: number;
  now: number;
  memberIds: string[]; // valid assignees
};

export type CommitResult = { ok: true; ops: CommittedOp[]; state: BoardState } | { ok: false; reason: string };

export function emptyBoard(id: string, name: string): BoardState {
  return { id, name, seq: 0, columns: {}, cards: {} };
}

// ---------- helpers ----------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function liveColumns(s: BoardState): Column[] {
  return sortPositioned(Object.values(s.columns).filter(c => !c.deleted));
}

export function cardsInColumn(s: BoardState, columnId: string, includeArchived = false): Card[] {
  return sortPositioned(Object.values(s.cards).filter(c => c.columnId === columnId && (includeArchived || !c.archived)));
}

export function cardFieldValue(card: Card, key: string): unknown {
  if (key === 'position') return { columnId: card.columnId, pos: card.pos };
  if (key.startsWith('label:')) return card.labels.includes(key.slice(6));
  return (card as any)[key];
}

// Last-writer-wins by HLC, per field.
// Returns whether the incoming write wins, and a Conflict if someone's value got lost.
function lww(meta: Meta, key: string, op: { hlc: string; base?: string | null }, actorId: string, current: unknown, incoming: unknown) {
  const m = meta[key];
  if (!m) return { applied: true as const };
  if (op.hlc > m.hlc) {
    // Incoming wins. It's a real conflict only if the writer never saw the value it replaces.
    const concurrent = op.base !== m.hlc && m.by !== actorId && !same(current, incoming);
    const conflict: Conflict | undefined = concurrent
      ? { field: key, loserId: m.by, loserValue: current, winnerId: actorId, winnerValue: incoming }
      : undefined;
    return { applied: true as const, conflict };
  }
  // A newer write is already there. Incoming loses; keep it in the log so the loser can see it.
  const conflict: Conflict | undefined =
    m.by !== actorId && !same(current, incoming)
      ? { field: key, loserId: actorId, loserValue: incoming, winnerId: m.by, winnerValue: current }
      : undefined;
  return { applied: false as const, conflict };
}

// Where should an item go? Honours the user's intent ("after X") over a stale key.
// items: visible siblings, sorted, WITHOUT the item being moved.
function place(items: Positioned[], selfId: string, proposed: string, afterId: string | null, beforeId: string | null) {
  let idx: number;
  if (afterId === null) idx = 0;
  else {
    const ai = items.findIndex(x => x.id === afterId);
    if (ai >= 0) idx = ai + 1;
    else {
      // "after" card is gone from this list -> fall back to "before", else the end.
      const bi = beforeId === null ? -1 : items.findIndex(x => x.id === beforeId);
      idx = bi >= 0 ? bi : items.length;
    }
  }
  const left = items[idx - 1];
  const right = items[idx];
  const me = { id: selfId, pos: proposed };
  // The client's key already lands in the right slot: keep it. This is what makes
  // two clients who computed the SAME key both keep it; the id tie-break orders them.
  const fits = (!left || comparePositioned(left, me) < 0) && (!right || comparePositioned(me, right) < 0);
  if (fits) return { pos: proposed, collision: false };
  if (left && right && left.pos === right.pos) return { pos: '', collision: true }; // no key fits between equal keys
  return { pos: keyBetween(left ? left.pos : null, right ? right.pos : null), collision: false };
}

// ---------- reducer ----------

export function applyCommitted(s: BoardState, op: CommittedOp): BoardState {
  const next: BoardState = { ...s, seq: op.seq };
  if (!op.applied) return next;
  const stamp: FieldMeta = { hlc: op.hlc, by: op.actorId };
  const d = op.data;

  const putCard = (id: string, patch: Partial<Card>, metaKeys: string[]) => {
    const c = next.cards[id];
    const meta = { ...c.meta };
    metaKeys.forEach(k => (meta[k] = stamp));
    next.cards = { ...next.cards, [id]: { ...c, ...patch, meta } };
  };
  const putColumn = (id: string, patch: Partial<Column>, metaKeys: string[]) => {
    const c = next.columns[id];
    const meta = { ...c.meta };
    metaKeys.forEach(k => (meta[k] = stamp));
    next.columns = { ...next.columns, [id]: { ...c, ...patch, meta } };
  };

  switch (op.type) {
    case 'column.create':
      next.columns = {
        ...next.columns,
        [d.columnId]: { id: d.columnId, name: d.name, pos: d.pos, deleted: false, meta: { name: stamp, position: stamp } },
      };
      break;
    case 'column.rename':
      putColumn(d.columnId, { name: d.name }, ['name']);
      break;
    case 'column.move':
      putColumn(d.columnId, { pos: d.pos }, ['position']);
      break;
    case 'column.delete':
      putColumn(d.columnId, { deleted: true }, ['deleted']);
      for (const cardId of d.archivedCardIds as string[]) putCard(cardId, { archived: true }, ['archived']);
      break;
    case 'card.create':
      next.cards = {
        ...next.cards,
        [d.cardId]: {
          id: d.cardId,
          columnId: d.columnId,
          pos: d.pos,
          title: d.title,
          description: '',
          assigneeId: null,
          labels: [],
          dueDate: null,
          archived: false,
          createdBy: op.actorId,
          meta: { title: stamp, position: stamp, created: stamp },
        },
      };
      break;
    case 'card.set': {
      const patch: Partial<Card> = { [d.field]: d.value };
      const keys = [d.field];
      if (d.restoreColumn) {
        // Restoring a card whose column was deleted also brings the column back,
        // so the card returns to its own column instead of a foreign one.
        const col = next.columns[d.restoreColumn];
        if (col?.deleted) putColumn(d.restoreColumn, { deleted: false }, ['deleted']);
      }
      putCard(d.cardId, patch, keys);
      break;
    }
    case 'card.label': {
      const c = next.cards[d.cardId];
      const labels = d.on ? [...new Set([...c.labels, d.label])].sort() : c.labels.filter(l => l !== d.label);
      putCard(d.cardId, { labels }, [`label:${d.label}`]);
      break;
    }
    case 'card.move':
      putCard(d.cardId, { columnId: d.columnId, pos: d.pos }, ['position']);
      break;
    case 'rebalance': {
      // Rewrites keys only; does not touch meta, it is not a user intent.
      const keys = d.keys as Record<string, string>;
      if (d.scope === 'columns') {
        const cols = { ...next.columns };
        for (const [id, pos] of Object.entries(keys)) cols[id] = { ...cols[id], pos };
        next.columns = cols;
      } else {
        const cards = { ...next.cards };
        for (const [id, pos] of Object.entries(keys)) cards[id] = { ...cards[id], pos };
        next.cards = cards;
      }
      break;
    }
  }
  return next;
}

// ---------- server rules ----------

export function commit(state: BoardState, op: ClientOp, ctx: CommitCtx): CommitResult {
  if (ctx.role === 'VIEWER') return { ok: false, reason: 'Viewers cannot edit this board' };
  if (op.boardId !== state.id) return { ok: false, reason: 'Wrong board' };

  const out: CommittedOp[] = [];
  let s = state;
  const emit = (type: CommittedOp['type'], data: Record<string, any>, extra: Partial<CommittedOp> = {}) => {
    const c: CommittedOp = {
      seq: ctx.nextSeq + out.length,
      opId: type === 'rebalance' ? `${op.opId}:rb${out.length}` : op.opId,
      boardId: op.boardId,
      actorId: ctx.actorId,
      clientId: op.clientId,
      hlc: op.hlc,
      createdAt: op.createdAt,
      receivedAt: ctx.now,
      type,
      data,
      applied: true,
      ...extra,
    };
    out.push(c);
    s = applyCommitted(s, c);
  };
  const reject = (reason: string): CommitResult => ({ ok: false, reason });

  const rebalanceCardsIfNeeded = (columnId: string) => {
    const all = cardsInColumn(s, columnId, true);
    if (needsRebalance(all)) emit('rebalance', { scope: 'cards', columnId, keys: rebalance(all) });
  };
  const rebalanceColumnsIfNeeded = () => {
    const all = Object.values(s.columns);
    if (needsRebalance(all)) emit('rebalance', { scope: 'columns', keys: rebalance(all) });
  };

  // Place a card into a column, rebalancing first if the target slot sits between equal keys.
  const placeCard = (cardId: string, columnId: string, proposed: string, afterId: string | null, beforeId: string | null) => {
    const siblings = () => cardsInColumn(s, columnId).filter(c => c.id !== cardId);
    let p = place(siblings(), cardId, proposed, afterId, beforeId);
    if (p.collision) {
      emit('rebalance', { scope: 'cards', columnId, keys: rebalance(cardsInColumn(s, columnId, true)) });
      p = place(siblings(), cardId, proposed, afterId, beforeId);
    }
    return p.pos;
  };
  const endOfColumn = (columnId: string) => {
    const cards = cardsInColumn(s, columnId, true);
    return keyBetween(cards.length ? cards[cards.length - 1].pos : null, null);
  };

  switch (op.type) {
    case 'column.create': {
      if (s.columns[op.columnId]) return reject('Column already exists');
      emit('column.create', { columnId: op.columnId, name: op.name, pos: op.pos });
      rebalanceColumnsIfNeeded();
      break;
    }
    case 'column.rename': {
      const col = s.columns[op.columnId];
      if (!col) return reject('Column not found');
      if (col.deleted) return reject('Column was deleted');
      const r = lww(col.meta, 'name', op, ctx.actorId, col.name, op.name);
      emit('column.rename', { columnId: op.columnId, name: op.name }, { applied: r.applied, conflict: r.conflict, before: col.name });
      break;
    }
    case 'column.move': {
      const col = s.columns[op.columnId];
      if (!col) return reject('Column not found');
      if (col.deleted) return reject('Column was deleted');
      const r = lww(col.meta, 'position', op, ctx.actorId, col.pos, op.pos);
      if (!r.applied) {
        emit('column.move', { columnId: op.columnId, pos: col.pos }, { applied: false, conflict: r.conflict });
        break;
      }
      const siblings = liveColumns(s).filter(c => c.id !== op.columnId);
      let p = place(siblings, op.columnId, op.pos, op.afterId, op.beforeId);
      if (p.collision) {
        emit('rebalance', { scope: 'columns', keys: rebalance(Object.values(s.columns)) });
        p = place(liveColumns(s).filter(c => c.id !== op.columnId), op.columnId, op.pos, op.afterId, op.beforeId);
      }
      emit('column.move', { columnId: op.columnId, pos: p.pos }, { before: col.pos });
      rebalanceColumnsIfNeeded();
      break;
    }
    case 'column.delete': {
      const col = s.columns[op.columnId];
      if (!col) return reject('Column not found');
      if (col.deleted) {
        emit('column.delete', { columnId: op.columnId, archivedCardIds: [] }, { applied: false });
        break;
      }
      // Cards inside are archived (restorable), never destroyed.
      const archivedCardIds = cardsInColumn(s, op.columnId).map(c => c.id);
      emit('column.delete', { columnId: op.columnId, archivedCardIds });
      break;
    }
    case 'card.create': {
      if (s.cards[op.cardId]) return reject('Card already exists');
      let columnId = op.columnId;
      let notice: string | undefined;
      const col = s.columns[columnId];
      if (!col) return reject('Column not found');
      if (col.deleted) {
        // Don't lose the new card: put it at the end of the first live column.
        const first = liveColumns(s)[0];
        if (!first) return reject('Column was deleted and no other column exists');
        columnId = first.id;
        notice = 'column_deleted_redirected';
      }
      const pos = notice ? endOfColumn(columnId) : placeCard(op.cardId, columnId, op.pos, op.afterId, op.beforeId);
      emit('card.create', { cardId: op.cardId, columnId, pos, title: op.title }, { notice });
      rebalanceCardsIfNeeded(columnId);
      break;
    }
    case 'card.set': {
      const card = s.cards[op.cardId];
      if (!card) return reject('Card not found');
      if (!validFieldValue(op.field as CardField, op.value)) return reject(`Invalid value for ${op.field}`);
      if (op.field === 'assigneeId' && op.value !== null && !ctx.memberIds.includes(op.value as string)) {
        return reject('Assignee is not a member of this organization');
      }
      const current = (card as any)[op.field];
      const r = lww(card.meta, op.field, op, ctx.actorId, current, op.value);
      const data: Record<string, any> = { cardId: op.cardId, field: op.field, value: op.value };
      let notice: string | undefined;
      if (r.applied && op.field === 'archived' && op.value === false && s.columns[card.columnId]?.deleted) {
        // The card's column was deleted (its cards were archived with it).
        // Restoring the card also restores the column, so the card lands back
        // in its own column instead of being moved to the first one.
        data.restoreColumn = card.columnId;
        notice = 'column_restored';
      }
      if (r.applied && card.archived && op.field !== 'archived') notice = 'card_archived';
      emit('card.set', data, { applied: r.applied, conflict: r.conflict, before: current, notice });
      break;
    }
    case 'card.label': {
      const card = s.cards[op.cardId];
      if (!card) return reject('Card not found');
      const key = `label:${op.label}`;
      const current = card.labels.includes(op.label);
      const r = lww(card.meta, key, op, ctx.actorId, current, op.on);
      emit('card.label', { cardId: op.cardId, label: op.label, on: op.on }, { applied: r.applied, conflict: r.conflict, before: current });
      break;
    }
    case 'card.move': {
      const card = s.cards[op.cardId];
      if (!card) return reject('Card not found');
      const col = s.columns[op.columnId];
      if (!col) return reject('Column not found');
      if (col.deleted) return reject('That column was deleted by someone else; the card stayed where it was');
      const current = { columnId: card.columnId, pos: card.pos };
      const r = lww(card.meta, 'position', op, ctx.actorId, current, { columnId: op.columnId, pos: op.pos });
      if (!r.applied) {
        emit('card.move', { cardId: op.cardId, ...current }, { applied: false, conflict: r.conflict ? { ...r.conflict, field: 'position' } : undefined });
        break;
      }
      const pos = placeCard(op.cardId, op.columnId, op.pos, op.afterId, op.beforeId);
      emit('card.move', { cardId: op.cardId, columnId: op.columnId, pos }, { before: current, notice: card.archived ? 'card_archived' : undefined });
      rebalanceCardsIfNeeded(op.columnId);
      break;
    }
  }
  return { ok: true, ops: out, state: s };
}
