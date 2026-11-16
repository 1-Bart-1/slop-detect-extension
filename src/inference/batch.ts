/** Which waiting texts run together, and the padded tensors of a batch. No browser APIs here. */

/** A text waiting for the model: its id and token ids, already cut to the model's window. */
export interface Waiting {
  id: number;
  ids: number[];
}

/** How far back from the newest text a batch looks for texts that fit. */
const SCAN = 64;

/**
 * Takes the next batch off the queue. The newest text always runs, since it is the one the
 * reader scrolled to last; older ones join, newest first, while the batch padded to its
 * longest text stays within `cap` tokens. A run costs time in proportion to its padded
 * tokens (RFC 015 F6), so the cap bounds how long one run takes.
 */
export function takeBatch<T extends Waiting>(queue: T[], cap: number): T[] {
  const newest = queue.pop();
  if (!newest) return [];
  const batch = [newest];
  let longest = newest.ids.length;
  for (let i = queue.length - 1; i >= Math.max(0, queue.length - SCAN); i--) {
    const candidate = queue[i]!;
    const padded = Math.max(longest, candidate.ids.length) * (batch.length + 1);
    if (padded > cap) continue;
    longest = Math.max(longest, candidate.ids.length);
    batch.push(candidate);
    queue.splice(i, 1);
  }
  return batch;
}

export interface Padded {
  /** Row after row, each `length` long. */
  ids: BigInt64Array;
  /** 1 over a row's own tokens and 0 over its padding. */
  mask: BigInt64Array;
  rows: number;
  length: number;
}

/** The batch as the model's two inputs: every row padded on the right to the longest. */
export function pad(batch: Waiting[], padId: number): Padded {
  const length = Math.max(...batch.map((text) => text.ids.length));
  const ids = new BigInt64Array(batch.length * length).fill(BigInt(padId));
  const mask = new BigInt64Array(batch.length * length);
  batch.forEach((text, row) => {
    ids.set(BigInt64Array.from(text.ids, BigInt), row * length);
    mask.fill(1n, row * length, row * length + text.ids.length);
  });
  return { ids, mask, rows: batch.length, length };
}
