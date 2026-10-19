// Convergence test.
//   npm run convergence            (defaults: 6 clients x 500 ops, seed 42)
//   npm run convergence -- 10 500 7
//
// Runs N simulated clients against the REAL sync processor (processBatch + commit) with
// an in-memory store. Each client uses the REAL SyncClient and UndoManager from @driftboard/shared.
// The network randomly delays, drops requests, drops responses AFTER the server applied them
// (forces re-sends -> tests exactly-once), drops live broadcasts (forces gap pulls), and
// takes clients offline for long stretches. One client is a Viewer (all its edits must be rejected).
// At the end everyone reconnects and we assert every client's state === server state.
import {
  BoardState,
  CommittedOp,
  OpInput,
  Role,
  SCHEMA_VERSION,
  SyncClient,
  UndoManager,
  cardsInColumn,
  emptyBoard,
  formatHlc,
  keyBetween,
  liveColumns,
  placementInput,
  sequentialKeys,
} from '@driftboard/shared';
import { MemoryStore } from '../src/sync/memory-store';
import { processBatch } from '../src/sync/process';

const [NUM_CLIENTS = 6, OPS_PER_CLIENT = 500, SEED = 42] = process.argv.slice(2).map(Number);

// Small seeded PRNG so a failing run can be replayed.
let seed = SEED >>> 0;
function rand() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const stats = {
  requests: 0,
  droppedRequests: 0,
  droppedResponses: 0,
  droppedBroadcasts: 0,
  duplicatesSuppressed: 0,
  committed: 0,
  rejected: 0,
  conflicts: 0,
  rebalances: 0,
  offlineStretches: 0,
  undos: 0,
  undoRefused: 0,
  maxKeyLength: 0,
};

type Sim = { name: string; userId: string; role: Role; client: SyncClient; undo: UndoManager; offlineFor: number };

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stable((v as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

async function main() {
  const boardId = 'board-1';
  const store = new MemoryStore(emptyBoard(boardId, 'Convergence'));
  const sims: Sim[] = [];
  for (let i = 0; i < NUM_CLIENTS; i++) store.roles.set(`user-${i}`, i === NUM_CLIENTS - 1 ? 'VIEWER' : 'EDITOR');
  store.roles.set('owner', 'OWNER');

  // Initial columns, committed by the owner.
  const keys = sequentialKeys(4);
  const now = Date.now();
  await processBatch(store, {
    boardId,
    userId: 'owner',
    sinceSeq: 0,
    ops: ['To do', 'Doing', 'Review', 'Done'].map((name, i) => ({
      opId: crypto.randomUUID(),
      boardId,
      clientId: 'owner',
      hlc: formatHlc(now, i, 'owner'),
      createdAt: now,
      v: SCHEMA_VERSION,
      type: 'column.create',
      columnId: `col-${i}`,
      name,
      pos: keys[i],
    })),
  });

  // Simulated WebSocket fan-out: random delay, sometimes lost.
  const broadcast = (ops: CommittedOp[]) => {
    for (const sim of sims) {
      if (!sim.client.online) continue;
      if (chance(0.15)) {
        stats.droppedBroadcasts++;
        continue;
      }
      setTimeout(() => sim.client.receive(ops), Math.floor(rand() * 20));
    }
  };

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const userId = `user-${i}`;
    const role = store.roles.get(userId)!;
    let sim!: Sim;
    const client = new SyncClient({
      actorId: userId,
      clientId: `client${i}`,
      role: role === 'VIEWER' ? 'EDITOR' : role, // the viewer's UI "thinks" it can edit; the server must refuse
      memberIds: [...store.roles.keys()],
      snapshot: { confirmed: emptyBoard(boardId, 'Convergence'), pending: [], lostEdits: [] },
      batchSize: 25,
      transport: async req => {
        stats.requests++;
        await sleep(Math.floor(rand() * 10));
        if (!sim.client.online) throw new Error('offline');
        if (chance(0.08)) {
          stats.droppedRequests++;
          throw new Error('request lost');
        }
        const out = await processBatch(store, { boardId, userId, sinceSeq: req.sinceSeq, ops: req.ops });
        for (const r of out.results) {
          if (r.duplicate) stats.duplicatesSuppressed++;
          else if (r.status === 'committed') stats.committed++;
          else stats.rejected++;
        }
        for (const c of out.committed) {
          if (c.conflict) stats.conflicts++;
          if (c.type === 'rebalance') stats.rebalances++;
          if (c.data.pos) stats.maxKeyLength = Math.max(stats.maxKeyLength, String(c.data.pos).length);
        }
        broadcast(out.committed);
        await sleep(Math.floor(rand() * 10));
        if (chance(0.08)) {
          stats.droppedResponses++; // server applied it, client never hears back
          throw new Error('response lost');
        }
        return { results: out.results, ops: out.ops, reset: out.reset };
      },
    });
    sim = { name: `client${i}`, userId, role, client, undo: new UndoManager(client), offlineFor: 0 };
    sims.push(sim);
  }

  // Everyone pulls the initial board.
  await Promise.all(sims.map(s => s.client.flush()));

  // Each client makes OPS_PER_CLIENT random changes concurrently.
  await Promise.all(
    sims.map(async sim => {
      for (let n = 0; n < OPS_PER_CLIENT; n++) {
        await sleep(Math.floor(rand() * 4));
        if (sim.offlineFor > 0) {
          if (--sim.offlineFor === 0) sim.client.setOnline(true);
        } else if (chance(0.02)) {
          sim.offlineFor = 20 + Math.floor(rand() * 80); // offline for 20-100 of its own ops
          stats.offlineStretches++;
          sim.client.setOnline(false);
        }
        randomAction(sim);
        if (sim.client.online && chance(0.3)) void sim.client.flush();
      }
    }),
  );

  // Everyone reconnects and drains their outbox.
  sims.forEach(s => s.client.setOnline(true));
  for (let round = 0; round < 200 && sims.some(s => s.client.pending.length > 0); round++) {
    await Promise.all(sims.map(s => s.client.flush()));
    await sleep(5);
  }
  await sleep(50); // let in-flight broadcasts land
  // Final pull, with a reliable network.
  for (const s of sims) {
    for (let i = 0; i < 20; i++) {
      await s.client.flush();
      if (s.client.confirmed.seq === store.state.seq && s.client.pending.length === 0) break;
    }
  }

  // ---- assertions ----
  const server = stable(store.state);
  let ok = true;
  console.log('\nDriftboard convergence test');
  console.log(`clients=${NUM_CLIENTS} (1 viewer) ops/client=${OPS_PER_CLIENT} seed=${SEED}\n`);
  for (const s of sims) {
    const same = stable(s.client.confirmed) === server;
    const viewSame = stable(s.client.view) === server;
    const pending = s.client.pending.length;
    ok = ok && same && viewSame && pending === 0;
    console.log(`${s.name.padEnd(9)} ${s.role.padEnd(7)} seq=${s.client.confirmed.seq} pending=${pending} state==server: ${same && viewSame ? 'YES' : 'NO'}`);
  }
  const orderOf = (st: BoardState) => liveColumns(st).map(c => `${c.name}: ${cardsInColumn(st, c.id).length} cards`);
  console.log('\nserver board:', orderOf(store.state).join(' | '));
  console.log('server seq:', store.state.seq, ' cards:', Object.keys(store.state.cards).length);
  console.log('\nstats:', stats);
  console.log(ok ? '\nPASS: all clients converged to the server state' : '\nFAIL: divergence detected');
  process.exit(ok ? 0 : 1);
}

function randomAction(sim: Sim) {
  const s = sim.client.view;
  const cols = liveColumns(s);
  const cards = Object.values(s.cards);
  const live = cards.filter(c => !c.archived && s.columns[c.columnId] && !s.columns[c.columnId].deleted);
  const run = (input: OpInput) => sim.undo.run(input);
  const r = rand();

  try {
    if (r < 0.05 && sim.undo.canUndo) {
      stats.undos++;
      if (!sim.undo.undo().ok) stats.undoRefused++;
    } else if (r < 0.07 && sim.undo.canRedo) {
      sim.undo.redo();
    } else if (r < 0.2 || live.length < 3) {
      const col = pick(cols);
      if (!col) return;
      const siblings = cardsInColumn(s, col.id);
      const idx = Math.floor(rand() * (siblings.length + 1));
      const place = placementInput('x', col.id, siblings, idx) as Extract<OpInput, { type: 'card.move' }>;
      run({ type: 'card.create', cardId: crypto.randomUUID(), columnId: col.id, pos: place.pos, afterId: place.afterId, beforeId: place.beforeId, title: `Card ${Math.floor(rand() * 1e6)}` });
    } else if (r < 0.45) {
      // Moves. Half of them target "right after the first card of column 0" so many clients collide on one slot.
      const card = pick(live);
      const col = chance(0.5) ? cols[0] : pick(cols);
      if (!card || !col) return;
      const siblings = cardsInColumn(s, col.id).filter(c => c.id !== card.id);
      const idx = chance(0.5) ? Math.min(1, siblings.length) : Math.floor(rand() * (siblings.length + 1));
      run(placementInput(card.id, col.id, siblings, idx));
    } else if (r < 0.7) {
      const card = pick(cards);
      if (!card) return;
      const field = pick(['title', 'description', 'assigneeId', 'dueDate'] as const);
      const value =
        field === 'title'
          ? `T${Math.floor(rand() * 1000)}`
          : field === 'description'
            ? `# Notes ${Math.floor(rand() * 1000)}\n- [ ] item`
            : field === 'assigneeId'
              ? pick([null, 'user-0', 'user-1', 'owner'])
              : pick([null, '2026-11-01', '2026-12-24']);
      run({ type: 'card.set', cardId: card.id, field, value });
    } else if (r < 0.8) {
      const card = pick(cards);
      if (card) run({ type: 'card.label', cardId: card.id, label: pick(['urgent', 'client', 'design', 'bug']), on: chance(0.6) });
    } else if (r < 0.88) {
      const card = pick(cards);
      if (card) run({ type: 'card.set', cardId: card.id, field: 'archived', value: !card.archived });
    } else if (r < 0.94) {
      const col = pick(cols);
      if (!col) return;
      const others = cols.filter(c => c.id !== col.id);
      const idx = Math.floor(rand() * (others.length + 1));
      const left = others[idx - 1] ?? null;
      const right = others[idx] ?? null;
      const pos = left && right && left.pos === right.pos ? left.pos : keyBetween(left?.pos ?? null, right?.pos ?? null);
      run({ type: 'column.move', columnId: col.id, pos, afterId: left?.id ?? null, beforeId: right?.id ?? null });
    } else if (r < 0.97) {
      const col = pick(cols);
      if (col) run({ type: 'column.rename', columnId: col.id, name: `Col ${Math.floor(rand() * 100)}` });
    } else if (r < 0.985) {
      const last = cols[cols.length - 1];
      run({ type: 'column.create', columnId: crypto.randomUUID(), name: 'New column', pos: keyBetween(last?.pos ?? null, null) });
    } else if (cols.length > 3) {
      run({ type: 'column.delete', columnId: pick(cols).id });
    }
  } catch {
    // e.g. keyBetween on equal neighbour keys before a rebalance arrived; skip this action.
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

