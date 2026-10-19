  
# Driftboard

A kanban board that keeps working offline and converges when everyone reconnects.
**Stack:** TypeScript · Next.js (static export + service worker) · Hono · PostgreSQL + Prisma · Better Auth.
No sync engine or CRDT library; the fractional index is hand-written.

See **[DESIGN.md](DESIGN.md)** for the decisions.

## Repo layout
```
packages/shared   sync core used by BOTH server and browser
  fracindex.ts    hand-written fractional indexing + tie-break + rebalance
  hlc.ts          hybrid logical clock
  ops.ts          wire format (zod), schema version, upcast
  engine.ts       commit() = server rules, applyCommitted() = reducer
  client.ts       SyncClient: outbox, optimistic view, push/pull, notices
  undo.ts         per-user undo/redo
apps/server       Hono API, Better Auth, Prisma, WebSocket presence, seed, convergence test
apps/web          Next.js UI, IndexedDB outbox, service worker
```

## Quick start (Docker)
```bash
docker compose up --build
```
- Web: http://localhost:3000 · API: http://localhost:8787
- Postgres on localhost:5433. The schema is pushed and seed data loaded automatically.

## Run without Docker
```bash
cp .env.example .env
cp .env apps/server/.env
echo "NEXT_PUBLIC_API_URL=http://localhost:8787" > apps/web/.env.local
npm install
docker compose up -d db                         
npm run db:push -w @driftboard/server           
npm run db:seed -w @driftboard/server           
npm run dev:server                              
npm run dev:web                                 
```
Offline mode needs the service worker, which only registers in a production build:
`npm run build -w @driftboard/web && npm run start -w @driftboard/web`.

## Seeded logins (password for all: `Driftboard123!`)
| Email | Acme Design Studio | Northwind Creative |
|---|---|---|
| owner@driftboard.dev | **Owner** | – |
| editor@driftboard.dev | **Editor** | Viewer |
| viewer@driftboard.dev | **Viewer** | – |
| riya@northwind.dev | Editor | **Owner** |
| kabir@northwind.dev | Editor | Editor |

All users are created through Better Auth (`auth.api.signUpEmail`) in `apps/server/src/seed.ts`. That's 5 users and 2 organizations.

## Tests
```bash
npm test                       # fractional index unit tests (vitest)
npm run convergence            # 6 clients x 500 ops (args: clients ops seed)
npm run convergence -- 10 500 7
```
The convergence test runs the real `processBatch` and `commit` and the real `SyncClient`/`UndoManager`, with an in-memory store. Its network randomly delays requests, drops requests, drops responses after commit (forcing re-sends), drops live broadcasts (forcing gap pulls) and takes clients offline for stretches. One client is a Viewer. It asserts every client's state equals the server's.

**Convergence output**

```bash
Assignment/vessify/driftboard  via node v26.3.0 ❯ npm test
npm run convergence
npm run build -w @driftboard/web
npm notice run test
npm notice run npm test -w @driftboard/shared
npm notice run @driftboard/shared@1.0.0 test
npm notice run vitest run

 RUN  v3.2.4 /home/dettolman/Aman/dev/work/Assignment/vessify/driftboard/packages/shared

 ✓ test/fracindex.test.ts (13 tests) 33ms
 ✓ test/engine.test.ts (3 tests) 9ms

 Test Files  2 passed (2)
      Tests  16 passed (16)
   Start at  14:45:02
   Duration  628ms (transform 174ms, setup 0ms, collect 244ms, tests 42ms, environment 0ms, prepare 295ms)

npm notice run convergence
npm notice run npm run convergence -w @driftboard/server
npm notice run @driftboard/server@1.0.0 convergence
npm notice run tsx scripts/convergence.ts
(node:33072) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

Driftboard convergence test
clients=6 (1 viewer) ops/client=500 seed=42

client0   EDITOR  seq=2722 pending=0 state==server: YES
client1   EDITOR  seq=2722 pending=0 state==server: YES
client2   EDITOR  seq=2722 pending=0 state==server: YES
client3   EDITOR  seq=2722 pending=0 state==server: YES
client4   EDITOR  seq=2722 pending=0 state==server: YES
client5   VIEWER  seq=2722 pending=0 state==server: YES

server board: Col 98: 22 cards | Col 13: 4 cards | Col 29: 33 cards | Col 44: 6 cards | Col 18: 1 cards | Col 51: 10 cards | Col 72: 9 cards | Col 52: 5 cards | Col 23: 12 cards | Col 10: 12 cards | Col 93: 6 cards | Col 8: 6 cards | Col 57: 6 cards | New column: 3 cards | Col 49: 7 cards | New column: 6 cards | Col 28: 1 cards | New column: 6 cards | Col 14: 6 cards | New column: 4 cards | New column: 11 cards | Col 57: 6 cards | New column: 3 cards | Col 52: 5 cards | Col 38: 10 cards | New column: 0 cards | Col 30: 11 cards | Col 83: 1 cards | New column: 0 cards | New column: 0 cards
server seq: 2722  cards: 375

stats: {
  requests: 618,
  droppedRequests: 54,
  droppedResponses: 37,
  droppedBroadcasts: 291,
  duplicatesSuppressed: 204,
  committed: 2420,
  rejected: 552,
  conflicts: 190,
  rebalances: 298,
  offlineStretches: 26,
  undos: 143,
  undoRefused: 27,
  maxKeyLength: 4
}

PASS: all clients converged to the server state
npm notice run @driftboard/web@1.0.0 build
npm notice run next build
   ▲ Next.js 15.5.4
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 4.4s
 ✓ Linting and checking validity of types    
 ✓ Collecting page data    
 ✓ Generating static pages (6/6)
 ✓ Collecting build traces    
 ✓ Exporting (2/2)
 ✓ Finalizing page optimization 

Route (app)                                 Size  First Load JS    
┌ ○ /                                    9.15 kB         111 kB
├ ○ /_not-found                            986 B         103 kB
├ ○ /board                               86.8 kB         189 kB
└ ○ /invite                               1.2 kB         103 kB
+ First Load JS shared by all             102 kB
  ├ chunks/18-4094310fe9a5ea15.js          46 kB
  ├ chunks/87c73c54-24122e7b92478d00.js  54.2 kB
  └ other shared chunks (total)          1.93 kB


○  (Static)  prerendered as static content  
```


## AI tools used
Claude, Chatgpt
