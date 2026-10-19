import { describe, expect, it } from 'vitest';
import { BoardState, ClientOp, SCHEMA_VERSION, applyCommitted, cardsInColumn, commit, emptyBoard, liveColumns } from '../src/index';
import { HlcClock } from '../src/hlc';

const BOARD = 'b1';
const ACTOR = 'u1';

function makeCtx(nextSeq: number, now = Date.now()) {
  return { actorId: ACTOR, role: 'OWNER' as const, nextSeq, now, memberIds: [ACTOR] };
}

function apply(state: BoardState, input: Record<string, any>, clock: HlcClock, now = Date.now()): BoardState {
  const op = {
    ...input,
    opId: crypto.randomUUID(),
    boardId: BOARD,
    clientId: 'c1',
    hlc: clock.tick(),
    createdAt: now,
    v: SCHEMA_VERSION,
    base: null,
  } as ClientOp;
  const r = commit(state, op, makeCtx(state.seq + 1, now));
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.state;
}

describe('column delete + card restore', () => {
  it('restoring a card from a deleted column restores the column and keeps the card in it', () => {
    const clock = new HlcClock('c1');
    let s = emptyBoard(BOARD, 'Board');
    s = apply(s, { type: 'column.create', columnId: 'col1', name: 'Todo', pos: 'a0' }, clock);
    s = apply(s, { type: 'column.create', columnId: 'col2', name: 'Done', pos: 'a1' }, clock);
    s = apply(s, { type: 'card.create', cardId: 'card1', columnId: 'col1', pos: 'a0', afterId: null, beforeId: null, title: 'Task' }, clock);

    s = apply(s, { type: 'column.delete', columnId: 'col1' }, clock);
    expect(liveColumns(s).map(c => c.id)).toEqual(['col2']);
    expect(s.cards.card1.archived).toBe(true);

    s = apply(s, { type: 'card.set', cardId: 'card1', field: 'archived', value: false }, clock);
    // The column comes back…
    expect(s.columns.col1.deleted).toBe(false);
    expect(liveColumns(s).map(c => c.id)).toEqual(['col1', 'col2']);
    // …and the card stays in its own column, not relocated to the first one.
    expect(s.cards.card1.archived).toBe(false);
    expect(s.cards.card1.columnId).toBe('col1');
    expect(cardsInColumn(s, 'col1').map(c => c.id)).toEqual(['card1']);
  });

  it('the restore op carries restoreColumn so every client applies the same payload', () => {
    const clock = new HlcClock('c1');
    let s = emptyBoard(BOARD, 'Board');
    s = apply(s, { type: 'column.create', columnId: 'col1', name: 'Todo', pos: 'a0' }, clock);
    s = apply(s, { type: 'card.create', cardId: 'card1', columnId: 'col1', pos: 'a0', afterId: null, beforeId: null, title: 'Task' }, clock);
    s = apply(s, { type: 'column.delete', columnId: 'col1' }, clock);

    const op = {
      type: 'card.set',
      cardId: 'card1',
      field: 'archived',
      value: false,
      opId: crypto.randomUUID(),
      boardId: BOARD,
      clientId: 'c1',
      hlc: clock.tick(),
      createdAt: Date.now(),
      v: SCHEMA_VERSION,
      base: null,
    } as ClientOp;
    const r = commit(s, op, makeCtx(s.seq + 1));
    if (!r.ok) throw new Error(r.reason);
    const restore = r.ops.find(o => o.type === 'card.set');
    expect(restore?.data.restoreColumn).toBe('col1');
    expect(restore?.notice).toBe('column_restored');

    // A second client replaying the committed op reaches the same state.
    const replay = r.ops.reduce(applyCommitted, s);
    expect(replay).toEqual(r.state);
  });

  it('restoring a card whose column is still live does not touch columns', () => {
    const clock = new HlcClock('c1');
    let s = emptyBoard(BOARD, 'Board');
    s = apply(s, { type: 'column.create', columnId: 'col1', name: 'Todo', pos: 'a0' }, clock);
    s = apply(s, { type: 'card.create', cardId: 'card1', columnId: 'col1', pos: 'a0', afterId: null, beforeId: null, title: 'Task' }, clock);
    s = apply(s, { type: 'card.set', cardId: 'card1', field: 'archived', value: true }, clock);

    const op = {
      type: 'card.set',
      cardId: 'card1',
      field: 'archived',
      value: false,
      opId: crypto.randomUUID(),
      boardId: BOARD,
      clientId: 'c1',
      hlc: clock.tick(),
      createdAt: Date.now(),
      v: SCHEMA_VERSION,
      base: null,
    } as ClientOp;
    const r = commit(s, op, makeCtx(s.seq + 1));
    if (!r.ok) throw new Error(r.reason);
    const restore = r.ops.find(o => o.type === 'card.set');
    expect(restore?.data.restoreColumn).toBeUndefined();
    expect(restore?.notice).toBeUndefined();
  });
});
