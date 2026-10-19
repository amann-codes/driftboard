// Undo/redo of MY OWN actions only.
//
// Each entry remembers which single field it touched and the HLC my write got.
// Undo is allowed only if that field still carries my HLC, i.e. nobody wrote
// that field after me. Because every op touches one field, undoing my title
// never touches a description someone else changed.
import { SyncClient, prettyField } from './client';
import { BoardState, cardsInColumn } from './engine';
import { keyBetween } from './fracindex';
import { OpInput } from './ops';

type Target = { kind: 'card' | 'column'; id: string; field: string };

type Entry = {
  label: string;
  target: Target;
  hlc: string; // HLC of the op that last applied this entry
  undo: (s: BoardState) => OpInput | string; // a string means "cannot undo: <why>"
  redo: (s: BoardState) => OpInput | string;
};

export type UndoResult = { ok: true; label: string } | { ok: false; message: string };

export class UndoManager {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];

  constructor(
    private readonly client: SyncClient,
    private readonly nameOf: (userId: string) => string = id => id,
  ) {}

  // Perform a user action and record how to reverse it.
  run(input: OpInput): void {
    const s = this.client.view;
    const entry = this.buildEntry(input, s);
    const op = this.client.act(input);
    if (entry) {
      this.undoStack.push({ ...entry, hlc: op.hlc });
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
  }

  undo(): UndoResult {
    return this.step(this.undoStack, this.redoStack, 'undo');
  }

  redo(): UndoResult {
    return this.step(this.redoStack, this.undoStack, 'redo');
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  private step(from: Entry[], to: Entry[], dir: 'undo' | 'redo'): UndoResult {
    const entry = from.pop();
    if (!entry) return { ok: false, message: `Nothing to ${dir}` };
    const s = this.client.view;
    const blocked = this.check(entry, s);
    if (blocked) return { ok: false, message: `Can't ${dir} "${entry.label}": ${blocked}` };
    const input = entry[dir](s);
    if (typeof input === 'string') return { ok: false, message: `Can't ${dir} "${entry.label}": ${input}` };
    const op = this.client.act(input);
    to.push({ ...entry, hlc: op.hlc });
    return { ok: true, label: entry.label };
  }

  // Why the entry can no longer be applied, or null if it can.
  private check(e: Entry, s: BoardState): string | null {
    if (e.target.kind === 'column') {
      const col = s.columns[e.target.id];
      if (!col) return 'the column no longer exists';
      if (col.deleted) return 'the column was deleted';
      const m = col.meta[e.target.field];
      if (m && m.hlc !== e.hlc) return `${this.nameOf(m.by)} changed it after you`;
      return null;
    }
    const card = s.cards[e.target.id];
    if (!card) return 'the card no longer exists';
    const archivedMeta = card.meta.archived;
    if (card.archived && e.target.field !== 'archived' && archivedMeta && archivedMeta.by !== this.client.actorId) {
      return `the card was archived by ${this.nameOf(archivedMeta.by)}`;
    }
    const m = card.meta[e.target.field];
    if (m && m.hlc !== e.hlc) return `${this.nameOf(m.by)} changed the ${prettyField(e.target.field)} after you`;
    return null;
  }

  private buildEntry(input: OpInput, s: BoardState): Omit<Entry, 'hlc'> | null {
    switch (input.type) {
      case 'card.set': {
        const card = s.cards[input.cardId];
        if (!card) return null;
        const before = (card as any)[input.field];
        const after = input.value;
        const set = (value: unknown): OpInput => ({ type: 'card.set', cardId: input.cardId, field: input.field, value });
        return {
          label: input.field === 'archived' ? (after ? 'archive card' : 'restore card') : `edit ${prettyField(input.field)}`,
          target: { kind: 'card', id: input.cardId, field: input.field },
          undo: () => set(before),
          redo: () => set(after),
        };
      }
      case 'card.label': {
        const toggle = (on: boolean): OpInput => ({ type: 'card.label', cardId: input.cardId, label: input.label, on });
        return {
          label: `${input.on ? 'add' : 'remove'} label`,
          target: { kind: 'card', id: input.cardId, field: `label:${input.label}` },
          undo: () => toggle(!input.on),
          redo: () => toggle(input.on),
        };
      }
      case 'card.create':
        return {
          label: 'create card',
          target: { kind: 'card', id: input.cardId, field: 'archived' },
          undo: () => ({ type: 'card.set', cardId: input.cardId, field: 'archived', value: true }),
          redo: () => ({ type: 'card.set', cardId: input.cardId, field: 'archived', value: false }),
        };
      case 'card.move': {
        const card = s.cards[input.cardId];
        if (!card) return null;
        // Remember the neighbour it sat after, so undo puts it back in the same visual slot.
        const fromColumn = card.columnId;
        const siblings = cardsInColumn(s, fromColumn);
        const idx = siblings.findIndex(c => c.id === card.id);
        const fromAfter = idx > 0 ? siblings[idx - 1].id : null;
        return {
          label: 'move card',
          target: { kind: 'card', id: input.cardId, field: 'position' },
          undo: st => moveInput(st, input.cardId, fromColumn, fromAfter),
          redo: st => moveInput(st, input.cardId, input.columnId, input.afterId),
        };
      }
      case 'column.rename': {
        const col = s.columns[input.columnId];
        if (!col) return null;
        const before = col.name;
        return {
          label: 'rename column',
          target: { kind: 'column', id: input.columnId, field: 'name' },
          undo: () => ({ type: 'column.rename', columnId: input.columnId, name: before }),
          redo: () => ({ type: 'column.rename', columnId: input.columnId, name: input.name }),
        };
      }
      default:
        // column.create / column.move / column.delete are not undoable (see DESIGN.md "cuts").
        return null;
    }
  }
}

// Build a card.move that places the card right after `afterId` in `columnId`.
export function moveInput(s: BoardState, cardId: string, columnId: string, afterId: string | null): OpInput | string {
  const col = s.columns[columnId];
  if (!col || col.deleted) return 'that column was deleted';
  const siblings = cardsInColumn(s, columnId).filter(c => c.id !== cardId);
  let idx = afterId === null ? 0 : siblings.findIndex(c => c.id === afterId) + 1;
  if (afterId !== null && idx === 0) idx = siblings.length; // neighbour gone: go to the end
  return placementInput(cardId, columnId, siblings, idx);
}

// Shared by drag-and-drop and undo: build a move to index `idx` among `siblings`.
export function placementInput(
  cardId: string,
  columnId: string,
  siblings: { id: string; pos: string }[],
  idx: number,
): OpInput {
  const left = siblings[idx - 1] ?? null;
  const right = siblings[idx] ?? null;
  let pos: string;
  if (left && right && left.pos === right.pos) pos = left.pos; // server will rebalance and re-place
  else pos = keyBetween(left?.pos ?? null, right?.pos ?? null);
  return { type: 'card.move', cardId, columnId, pos, afterId: left?.id ?? null, beforeId: right?.id ?? null };
}
