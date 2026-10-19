import { describe, expect, it } from 'vitest';
import { comparePositioned, isValidKey, keyBetween, MAX_KEY_LENGTH, needsRebalance, rebalance, sortPositioned } from '../src/fracindex';

describe('keyBetween: start and end', () => {
  it('first key in an empty list is a0', () => {
    expect(keyBetween(null, null)).toBe('a0');
  });

  it('inserting at the end keeps increasing', () => {
    let k = 'a0';
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(k, null);
      expect(next > k).toBe(true);
      k = next;
    }
  });

  it('inserting at the start keeps decreasing (goes negative)', () => {
    let k = 'a0';
    for (let i = 0; i < 200; i++) {
      const prev = keyBetween(null, k);
      expect(prev < k).toBe(true);
      expect(isValidKey(prev)).toBe(true);
      k = prev;
    }
  });

  it('crosses integer length boundaries', () => {
    expect(keyBetween('az', null)).toBe('b00');
    expect(keyBetween(null, 'a0')).toBe('Zz');
  });
});

describe('keyBetween: between two keys', () => {
  it('matches the brief: between a0 and a1 is a0V', () => {
    expect(keyBetween('a0', 'a1')).toBe('a0V');
  });

  it('between adjacent keys goes one digit deeper', () => {
    const k = keyBetween('a0V', 'a0W');
    expect(k > 'a0V' && k < 'a0W').toBe(true);
    expect(k.startsWith('a0V')).toBe(true);
  });

  it('always strictly between, even after many inserts into the same gap', () => {
    let lo = 'a0';
    const hi = 'a1';
    for (let i = 0; i < 100; i++) {
      const k = keyBetween(lo, hi);
      expect(k > lo && k < hi).toBe(true);
      lo = k;
    }
  });

  it('rejects invalid ranges and keys', () => {
    expect(() => keyBetween('a1', 'a0')).toThrow();
    expect(() => keyBetween('a0', 'a0')).toThrow();
    expect(() => keyBetween('a10', null)).toThrow(); // trailing zero
    expect(isValidKey('hello world')).toBe(false);
  });
});

describe('tie-breaking when two keys collide', () => {
  it('two clients computing the same key end up in the same order everywhere', () => {
    // Riya and Kabir both drop between a0 and a1 and both get a0V.
    const k = keyBetween('a0', 'a1');
    const cards = [
      { id: 'card-fix', pos: 'a0' },
      { id: 'card-riya', pos: k },
      { id: 'card-kabir', pos: k },
      { id: 'card-write', pos: 'a1' },
    ];
    const orders = [cards, [...cards].reverse(), [cards[2], cards[0], cards[3], cards[1]]].map(list => sortPositioned(list).map(c => c.id));
    expect(orders[0]).toEqual(orders[1]);
    expect(orders[1]).toEqual(orders[2]);
    expect(orders[0]).toEqual(['card-fix', 'card-kabir', 'card-riya', 'card-write']);
  });

  it('works for ten clients colliding on one key', () => {
    const k = keyBetween('a0', 'a1');
    const ids = Array.from({ length: 10 }, (_, i) => `client-${i}-card`);
    const a = sortPositioned(ids.map(id => ({ id, pos: k }))).map(c => c.id);
    const b = sortPositioned([...ids].reverse().map(id => ({ id, pos: k }))).map(c => c.id);
    expect(a).toEqual(b);
  });

  it('comparator is a total order', () => {
    expect(comparePositioned({ id: 'x', pos: 'a0' }, { id: 'x', pos: 'a0' })).toBe(0);
    expect(comparePositioned({ id: 'a', pos: 'a0V' }, { id: 'b', pos: 'a0V' })).toBe(-1);
  });
});

describe('rebalancing', () => {
  it('detects long keys and collisions', () => {
    expect(needsRebalance([{ id: '1', pos: 'a0' }, { id: '2', pos: 'a1' }])).toBe(false);
    expect(needsRebalance([{ id: '1', pos: 'a0V' }, { id: '2', pos: 'a0V' }])).toBe(true);
    expect(needsRebalance([{ id: '1', pos: 'a0' + 'V'.repeat(MAX_KEY_LENGTH) }])).toBe(true);
  });

  it('produces short keys and keeps the visible order', () => {
    let lo = 'a0';
    const items = [{ id: 'first', pos: 'a0' }];
    for (let i = 0; i < 30; i++) {
      lo = keyBetween(lo, 'a1');
      items.push({ id: `c${String(i).padStart(2, '0')}`, pos: lo });
    }
    items.push({ id: 'dupe', pos: lo }); // collision too
    const before = sortPositioned(items).map(c => c.id);
    const keys = rebalance(items);
    const after = sortPositioned(items.map(c => ({ ...c, pos: keys[c.id] })));
    expect(after.map(c => c.id)).toEqual(before);
    expect(after.every(c => c.pos.length <= 3)).toBe(true);
    expect(needsRebalance(after)).toBe(false);
  });
});
