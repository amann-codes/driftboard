# Driftboard: design

**Core idea:** the server keeps an append-only **op log** per board and gives each accepted change a gap-free `seq`. Every client rebuilds its "confirmed" state by applying the server's committed ops **in seq order** with the **same pure reducer** (`packages/shared/src/engine.ts`). Its own unsent changes (the outbox) are replayed on top for the optimistic view. Same input, same order and same function means every client ends with the same state. No CRDT library: conflict rules live in one small file you can read top to bottom.

## 1. A single change on the wire
```json
{ "opId": "6f1c…uuid", "boardId": "b1", "clientId": "a1b2c3", "v": 1,
  "hlc": "000001760000000:000003:a1b2c3", "createdAt": 1760000000000,
  "type": "card.set", "cardId": "c9", "field": "title", "value": "New title",
  "base": "000001759999000:000000:ffee00" }
```
**Why this shape:** one op = **one field of one entity** (or one move), so per-field merge and per-field undo fall out naturally. `opId` is the idempotency key. `hlc` orders writes. `base` is the HLC of the field the user was looking at, which tells "I overwrote what I saw" apart from "we edited at the same time". `createdAt` gives offline history its "made at" time. `v` lets old queued ops be migrated. Moves carry **intent** (`afterId`/`beforeId`) **and** a proposed key, so the server can re-place a card if the keys changed underneath it. The server answers with a `CommittedOp`: `seq`, normalised `data`, `applied`, `before`, `conflict`, `notice`.

## 2. Ordering, and why not wall-clock time
- **Order of application** = the server's `seq`, a total order everyone shares. Assigned under a `SELECT … FOR UPDATE` row lock on the board.
- **Who wins a same-field conflict** = a **Hybrid Logical Clock**: `max(wall clock, highest HLC seen) + counter + clientId`. It's a string, so `<` compares it.
- Plain wall-clock time fails because clocks drift by seconds or minutes, and a phone with a wrong clock would win every conflict. Two edits in the same millisecond also tie. An HLC fixes the important case: **if I saw your edit and then edited, mine is ordered after yours even if my clock is behind.** The clientId breaks exact ties. The server clamps HLCs more than 60 s in the future, so one broken clock can't dominate.

## 3. Conflict rules, field by field
| Field | Rule | Loser sees |
|---|---|---|
| title, description, assignee, due date | LWW register per field, by HLC. Description is replaced whole (no text merge). | ⚠ on the card + "Your version: …" + **Use mine**; history line |
| labels | one LWW register **per label** (`label:urgent`), so different labels never conflict | same |
| position (column + key) | LWW by HLC as one field; the winner is re-placed by intent (`afterId`) | "your move was replaced" |
| archived | LWW. **Edits on an archived card still apply** (nothing is lost); the card stays archived and the editor gets "card was archived, restore?" | notice |
| move into a deleted column | **rejected**, and the card stays where it was (only position intent is lost; the user is told) | rejection toast |
| create in a deleted column | redirected to the end of the first live column (content is never lost) | notice |
| column delete | its cards are **archived** (restorable), never destroyed; restoring one of its cards also **restores the column**, so the card returns to its own column | notice |
| column name / order | LWW, same as cards | – |
Different fields never conflict, because each op touches one field.

## 4. Exactly-once
`Op.opId` is `UNIQUE`. Before applying, the server looks up the opId and, if found, returns the **stored** result (committed seq or the same rejection reason) with `duplicate: true` and applies nothing. Rejections are stored too, so a re-sent rejected op gets the same answer. A client keeps an op in its outbox until it sees it committed (or rejected), so "response lost after commit" leads to a re-send, then a dedupe. Duplicates inside one batch are caught by an in-memory map.

## 5. Fractional keys: tie-break and rebalancing
Hand-written base-62 keys (`a0`, `a0V`, `a1`…; see `fracindex.ts`). **Sort order = (key, id).** Two clients that compute the same key keep it, and the card id decides who's first on every client and the server with no coordination. This works for any number of clients. The server keeps the client's key if it lands between the intended neighbours. Otherwise it recomputes from `afterId`/`beforeId`. **Rebalance when** a column has a key longer than 10 chars **or** two equal keys. The server then emits a `rebalance` op in the same transaction that rewrites the whole column to `a0, a1, …` in current visual order. It's an op in the log, so all clients apply it at the same seq. A move whose neighbours have equal keys triggers the rebalance **before** placement. Ops queued against old keys still land correctly because the server places by intent.

## 6. Two weeks offline with 300 queued changes
The outbox (IndexedDB) is sent in order, 50 per request. Each op runs through normal validation **now**: roles as they are today, cards that still exist, HLC LWW (two-week-old edits usually **lose** to newer ones, and the user sees each lost value and can re-apply it). If the board moved on by more than 1000 ops, the server sends a **snapshot** instead of the log. Pending ops are kept and replayed on top. Ops for cards that no longer exist are rejected one by one, with toasts and the "Not synced" panel. If the session expired, the outbox is kept and the user is asked to sign in.

## 7. Schema change while clients are offline
Every op has `v`. The server runs `upcast()` (old version → current version) before validating, so old queued ops keep working. If a client is **newer** than the server (`v > SCHEMA_VERSION`), its ops are rejected with a clear message rather than misread. The client's IndexedDB record has its own `STORAGE_SCHEMA`. On mismatch the cached board is thrown away and re-fetched, but **the outbox is kept**. Rule: additive DB changes ship first, and an upcaster lives for at least the max offline window.

## 8. Approaches considered and rejected
1. **State-based sync (send the whole card, server diffs, LWW per row).** It's simple, but you lose per-field merge unless you diff, can't express moves by intent, and payloads are bigger. Two edits to different fields would clobber each other.
2. **Pure peer CRDT (per-field LWW map + OR-set, merge anywhere, no server order).** It converges without a server, but the server still has to enforce roles and existence (R9), so you need an authority anyway. Undo, rejection rollback and "card was archived" notices are much harder without a single order. A server-ordered log was simpler to reason about and to explain line by line.
(Also rejected: wall-clock LWW (see §2), and operational transform for descriptions, which is too much for the time box.)

## 9. 100 boards × 50 live users each (5,000 sockets)
**What breaks first:** (a) `processBatch` **loads the whole board** per push and holds a row lock, so one busy board serialises all of its writers. (b) Presence and broadcast are **in-process memory**, so you can't run a second API instance. (c) Every heartbeat re-broadcasts presence (50 users means about 830 msgs/s per board). (d) The Op table grows without bound.
**Changes:** load only the entities an op touches; Redis pub/sub (or Postgres `LISTEN/NOTIFY`) for fan-out and presence, so the API scales horizontally with sticky WebSockets; presence diffs throttled to 1/s; snapshot + compact the log (keep 90 days for history); an index on `(boardId, seq)` (present).

## 10. Ambiguities and the decision taken
- Same-field rule → **later intent wins (HLC)**, not "last to reach the server".
- Archive vs offline edit → the edit is kept on the archived card, with a notice.
- Move into a deleted column → rejected. Create into one → redirected.
- Column delete → archives its cards. Restoring one of those cards also restores its column, so the card always comes back to its own column.
- Viewer role → read-only UI, and the server rejects every op. Role changes apply to queued ops on arrival.
- Invite link → reusable, 7-day expiry, role fixed in the link, never downgrades an existing member.
- Projects → a simple grouping; boards belong to a project and to the org.
- "Fully editable offline" → board edits yes; creating orgs, boards or invites needs the network.
- Multiple tabs → one editing tab per board (Web Locks); others are told to close it.
- Undo scope → card field edits, labels, moves, create and archive, plus column rename. Not undoable: column create, move and delete.
- "Made offline" in history → shown when `receivedAt − createdAt > 10 s`.
- Assignee → must be a member of the org at commit time.

## 11. What I cut, and why
Order of priority: **correctness of sync** (R3/R4/R5/R9 plus the convergence test) → offline → undo and history → UI polish. Cut: text-level merge of descriptions (whole-field LWW plus "use mine" instead), column-delete undo, live cursors, member-removal UI (roles can be changed via API), email verification, and Prisma migrations (`db push` for the take-home; I'd generate migrations before production). Drag-and-drop uses **dnd-kit** (allowed by the brief); the op layer still does the real placement work, so swapping the DnD library touches only `BoardView.tsx`.
