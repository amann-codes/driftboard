// Hand-written fractional indexing (no packages allowed).
//
// A key is "<integer part><fraction part>" written in base 62.
// The first char of the integer part tells its length:
//   'a'..'z' -> 2..27 chars (positive integers, 'a0' is the first key we hand out)
//   'A'..'Z' -> 27..2 chars (negative integers, used when inserting before 'a0')
// The fraction part never ends in '0', so every key has exactly one spelling.
// Plain string comparison (a < b) gives the order, in JS and in Postgres with COLLATE "C".

export const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const SMALLEST_INTEGER = 'A' + '0'.repeat(26);

// Keys longer than this trigger a rebalance of the whole column (see DESIGN.md).
export const MAX_KEY_LENGTH = 10;

function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid key head "${head}"`);
}

function integerPart(key: string): string {
  const len = integerLength(key[0]);
  if (len > key.length) throw new Error(`invalid key "${key}"`);
  return key.slice(0, len);
}

function validate(key: string): void {
  if (typeof key !== 'string' || key.length === 0) throw new Error('empty key');
  if (key === SMALLEST_INTEGER) throw new Error('reserved key');
  for (const ch of key) if (!DIGITS.includes(ch)) throw new Error(`invalid char in key "${key}"`);
  const fraction = key.slice(integerPart(key).length);
  if (fraction.endsWith('0')) throw new Error(`key "${key}" has a trailing zero`);
}

export function isValidKey(key: unknown): boolean {
  try {
    validate(key as string);
    return true;
  } catch {
    return false;
  }
}

// Midpoint of two fraction strings, a < b. b === null means "1" (no upper bound).
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // Skip the common prefix; 'a' is padded with zeros.
    let n = 0;
    while ((a[n] || '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : BASE;
  if (digitB - digitA > 1) {
    // There is room for a single digit in between.
    return DIGITS[Math.round((digitA + digitB) / 2)];
  }
  // Adjacent digits: keep a's digit and go one level deeper.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

function incrementInteger(x: string): string | null {
  const [head, ...digits] = x.split('');
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]) + 1;
    if (d === BASE) digits[i] = '0';
    else {
      digits[i] = DIGITS[d];
      carry = false;
    }
  }
  if (!carry) return head + digits.join('');
  if (head === 'Z') return 'a0';
  if (head === 'z') return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > 'a') digits.push('0');
  else digits.pop();
  return next + digits.join('');
}

function decrementInteger(x: string): string | null {
  const [head, ...digits] = x.split('');
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]) - 1;
    if (d === -1) digits[i] = DIGITS[BASE - 1];
    else {
      digits[i] = DIGITS[d];
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join('');
  if (head === 'a') return 'Z' + DIGITS[BASE - 1];
  if (head === 'A') return null;
  const prev = String.fromCharCode(head.charCodeAt(0) - 1);
  if (prev < 'Z') digits.push(DIGITS[BASE - 1]);
  else digits.pop();
  return prev + digits.join('');
}

// Returns a key strictly between a and b. null means "no neighbour on that side".
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validate(a);
  if (b !== null) validate(b);
  if (a !== null && b !== null && a >= b) throw new Error(`keyBetween: "${a}" is not before "${b}"`);

  if (a === null) {
    if (b === null) return 'a0';
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb);
    if (ib < b) return ib; // b has a fraction, so its bare integer is smaller
    const prev = decrementInteger(ib);
    if (prev === null) throw new Error('cannot insert before this key');
    return prev;
  }

  if (b === null) {
    const ia = integerPart(a);
    const next = incrementInteger(ia);
    return next === null ? ia + midpoint(a.slice(ia.length), null) : next;
  }

  const ia = integerPart(a);
  const ib = integerPart(b);
  if (ia === ib) return ia + midpoint(a.slice(ia.length), b.slice(ib.length));
  const next = incrementInteger(ia);
  if (next === null) throw new Error('cannot increment key');
  if (next < b) return next;
  return ia + midpoint(a.slice(ia.length), null);
}

// n short keys in ascending order: a0, a1, ... az, b00, ... Used for rebalancing.
export function sequentialKeys(n: number): string[] {
  const keys: string[] = [];
  let k: string | null = null;
  for (let i = 0; i < n; i++) {
    k = keyBetween(k, null);
    keys.push(k);
  }
  return keys;
}

// ---- Ordering with a deterministic tie-break ----

export type Positioned = { id: string; pos: string };

// Sort by key, then by id. Two cards that got the same key always land in the
// same order on every client and on the server, without talking to each other.
export function comparePositioned(a: Positioned, b: Positioned): number {
  if (a.pos !== b.pos) return a.pos < b.pos ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function sortPositioned<T extends Positioned>(items: T[]): T[] {
  return [...items].sort(comparePositioned);
}

// A list needs a rebalance when any key is too long or two keys collide.
export function needsRebalance(items: Positioned[]): boolean {
  const sorted = sortPositioned(items);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].pos.length > MAX_KEY_LENGTH) return true;
    if (i > 0 && sorted[i].pos === sorted[i - 1].pos) return true;
  }
  return false;
}

// New short keys for the whole list, keeping the current visible order.
export function rebalance(items: Positioned[]): Record<string, string> {
  const sorted = sortPositioned(items);
  const keys = sequentialKeys(sorted.length);
  const out: Record<string, string> = {};
  sorted.forEach((item, i) => (out[item.id] = keys[i]));
  return out;
}
