import { describe, expect, test } from 'vitest';
import { ScoreCache } from '@/src/host/cache';
import { Requests } from '@/src/host/requests';

describe('ScoreCache', () => {
  test('drops the entry that was used longest ago', () => {
    const cache = new ScoreCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // now b is the older one
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});

describe('Requests', () => {
  test('gives every text an id of its own and returns the score under the owner’s id', () => {
    const requests = new Requests<string>(10);
    const first = requests.accept('tab one', [{ id: 0, text: 'a' }]);
    const second = requests.accept('tab two', [{ id: 0, text: 'b' }]);
    expect(first).toEqual({ known: [], fresh: [{ id: 0, text: 'a' }] });
    expect(second.fresh).toEqual([{ id: 1, text: 'b' }]);

    const replies = requests.settle([
      { id: 1, tokens: 40, score: 0.9 },
      { id: 0, tokens: 12, score: null },
    ]);
    expect(replies.get('tab one')).toEqual([{ id: 0, tokens: 12, score: null }]);
    expect(replies.get('tab two')).toEqual([{ id: 0, tokens: 40, score: 0.9 }]);
  });

  test('answers a text that was scored before without the worker', () => {
    const requests = new Requests<string>(10);
    requests.accept('tab one', [{ id: 5, text: 'a' }]);
    requests.settle([{ id: 0, tokens: 40, score: 0.9 }]);
    expect(requests.accept('tab two', [{ id: 7, text: 'a' }])).toEqual({
      known: [{ id: 7, tokens: 40, score: 0.9 }],
      fresh: [],
    });
  });

  test('cancels some of an owner’s texts, or all, and never another owner’s', () => {
    const requests = new Requests<string>(10);
    requests.accept('tab one', [
      { id: 0, text: 'a' },
      { id: 1, text: 'b' },
      { id: 2, text: 'c' },
    ]);
    requests.accept('tab two', [{ id: 0, text: 'd' }]);
    expect(requests.cancel('tab one', [1])).toEqual([1]);
    expect(requests.cancel('tab one')).toEqual([0, 2]);
    expect(requests.cancel('tab one')).toEqual([]);
    // A result that arrives after the cancel has nobody to go to.
    expect(requests.settle([{ id: 1, tokens: 40, score: 0.5 }]).size).toBe(0);
    expect(requests.cancel('tab two', [0])).toEqual([3]);
  });
});
