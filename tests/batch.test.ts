import { describe, expect, test } from 'vitest';
import { type Waiting, pad, takeBatch } from '@/src/inference/batch';

/** A waiting text of `length` tokens, each token equal to the text's id. */
const text = (id: number, length: number): Waiting => ({ id, ids: new Array<number>(length).fill(id) });
const ids = (batch: Waiting[]) => batch.map((waiting) => waiting.id);

describe('takeBatch', () => {
  test('an empty queue gives an empty batch', () => {
    expect(takeBatch([], 1024)).toEqual([]);
  });

  test('takes the newest first and leaves the rest in order', () => {
    const queue = [text(1, 100), text(2, 100), text(3, 100)];
    expect(ids(takeBatch(queue, 200))).toEqual([3, 2]);
    expect(ids(queue)).toEqual([1]);
  });

  test('counts every row at the length of the longest', () => {
    // 3 x 300 padded tokens is over the cap although the texts sum to 400.
    const queue = [text(1, 50), text(2, 50), text(3, 300)];
    expect(ids(takeBatch(queue, 600))).toEqual([3, 2]);
  });

  test('skips a text that does not fit and takes an older one that does', () => {
    const queue = [text(1, 40), text(2, 500), text(3, 40)];
    expect(ids(takeBatch(queue, 100))).toEqual([3, 1]);
    expect(ids(queue)).toEqual([2]);
  });

  test('the newest text runs alone when it is over the cap by itself', () => {
    const queue = [text(1, 40), text(2, 512)];
    expect(ids(takeBatch(queue, 256))).toEqual([2]);
    expect(ids(queue)).toEqual([1]);
  });

  test('drains a queue completely, batch after batch', () => {
    const queue = Array.from({ length: 200 }, (_, id) => text(id, 30 + (id % 7) * 60));
    const seen: number[] = [];
    for (let batch = takeBatch(queue, 1024); batch.length; batch = takeBatch(queue, 1024)) {
      const longest = Math.max(...batch.map((waiting) => waiting.ids.length));
      expect(batch.length === 1 || batch.length * longest <= 1024).toBe(true);
      seen.push(...ids(batch));
    }
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 200 }, (_, id) => id));
  });
});

describe('pad', () => {
  test('pads on the right and masks the padding', () => {
    const padded = pad([text(7, 3), text(8, 1)], 0);
    expect(padded.rows).toBe(2);
    expect(padded.length).toBe(3);
    expect([...padded.ids]).toEqual([7n, 7n, 7n, 8n, 0n, 0n]);
    expect([...padded.mask]).toEqual([1n, 1n, 1n, 1n, 0n, 0n]);
  });

  test('a single text has no padding', () => {
    const padded = pad([text(5, 4)], 9);
    expect([...padded.ids]).toEqual([5n, 5n, 5n, 5n]);
    expect([...padded.mask]).toEqual([1n, 1n, 1n, 1n]);
  });
});
