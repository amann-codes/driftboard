// The shape of a single change ("op") on the wire, plus its validation.
import { z } from 'zod';
import { isValidKey } from './fracindex';
import { HLC_PATTERN } from './hlc';

// Bump this when the op format changes, and add a step to upcast() below.
export const SCHEMA_VERSION = 1;

export const CARD_FIELDS = ['title', 'description', 'assigneeId', 'dueDate', 'archived'] as const;
export type CardField = (typeof CARD_FIELDS)[number];

const id = z.string().min(1).max(64);
const key = z.string().refine(isValidKey, 'invalid position key');
const hlc = z.string().regex(HLC_PATTERN, 'invalid hlc');
const name = z.string().trim().min(1).max(80);

// Fields every op carries.
const envelope = {
  opId: z.string().uuid(), // idempotency key, generated once on the device
  boardId: id,
  clientId: id, // which device made it
  hlc, // ordering stamp, see hlc.ts
  createdAt: z.number().int().positive(), // device time when the user did it (for history)
  v: z.literal(SCHEMA_VERSION),
};

// `base` = the field's HLC the user was looking at when they edited it.
// The server uses it to tell "I overwrote something I saw" from "we edited at the same time".
const base = hlc.nullable();

export const OpSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('column.create'), columnId: id, name, pos: key }),
  z.object({ ...envelope, type: z.literal('column.rename'), columnId: id, name, base }),
  z.object({ ...envelope, type: z.literal('column.move'), columnId: id, pos: key, afterId: id.nullable(), beforeId: id.nullable(), base }),
  z.object({ ...envelope, type: z.literal('column.delete'), columnId: id }),
  z.object({
    ...envelope,
    type: z.literal('card.create'),
    cardId: id,
    columnId: id,
    pos: key,
    afterId: id.nullable(),
    beforeId: id.nullable(),
    title: z.string().trim().min(1).max(200),
  }),
  z.object({ ...envelope, type: z.literal('card.set'), cardId: id, field: z.enum(CARD_FIELDS), value: z.unknown(), base }),
  z.object({ ...envelope, type: z.literal('card.label'), cardId: id, label: z.string().trim().min(1).max(32), on: z.boolean(), base }),
  z.object({
    ...envelope,
    type: z.literal('card.move'),
    cardId: id,
    columnId: id,
    pos: key,
    afterId: id.nullable(),
    beforeId: id.nullable(),
    base,
  }),
]);

export type ClientOp = z.infer<typeof OpSchema>;
export type OpType = ClientOp['type'];

// What the user's UI asks for; the SyncClient fills in the envelope.
// (Distributive Omit so each op type keeps its own fields.)
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type OpInput = DistOmit<ClientOp, 'opId' | 'boardId' | 'clientId' | 'hlc' | 'createdAt' | 'v' | 'base'>;

// Per-field value rules for card.set.
const fieldSchemas: Record<CardField, z.ZodTypeAny> = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000),
  assigneeId: id.nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  archived: z.boolean(),
};

export function validFieldValue(field: CardField, value: unknown): boolean {
  return fieldSchemas[field].safeParse(value).success;
}

// Ops queued by an older app version are migrated here before validation.
// v1 is the only version today. Example of a future step:
//   if (raw.v === 1) raw = { ...raw, v: 2, ... }
export function upcast(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  if (typeof raw.v !== 'number') return raw;
  if (raw.v > SCHEMA_VERSION) throw new Error('client_newer_than_server');
  return raw;
}

// ---- What the server sends back ----

export type Conflict = {
  field: string;
  loserId: string;
  loserValue: unknown;
  winnerId: string;
  winnerValue: unknown;
};

// A change after the server accepted it. Every client applies exactly these,
// in seq order, with the same reducer, which is why everyone converges.
export type CommittedOp = {
  seq: number; // position in the board's log, assigned by the server
  opId: string;
  boardId: string;
  actorId: string;
  clientId: string;
  hlc: string;
  createdAt: number; // when it was made on the device
  receivedAt: number; // when it reached the server
  type: OpType | 'rebalance';
  data: Record<string, any>; // normalised payload the reducer applies
  applied: boolean; // false = lost a same-field conflict, kept for history only
  before?: unknown; // old value, for card history
  conflict?: Conflict;
  notice?: string; // e.g. 'card_archived': saved, but the card is archived
};

export type PushResult = {
  opId: string;
  status: 'committed' | 'rejected';
  seq?: number;
  reason?: string;
  duplicate?: boolean;
};
