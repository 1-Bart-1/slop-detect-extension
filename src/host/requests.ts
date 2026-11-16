import type { Item, Scored } from '@/src/protocol';
import { ScoreCache } from './cache';

/**
 * Which owner (a tab's port) asked for which text. Every tab numbers its texts itself, so
 * the worker gets them under ids of the host's own; a text scored before is answered from
 * the cache. No browser APIs here.
 */
export class Requests<Owner> {
  /** The texts in the worker, by the host's id. */
  private readonly pending = new Map<number, { owner: Owner; id: number; text: string }>();
  private readonly scores: ScoreCache<Omit<Scored, 'id'>>;
  private nextId = 0;

  constructor(cacheSize: number) {
    this.scores = new ScoreCache(cacheSize);
  }

  /** Splits an owner's texts into the ones scored before and the ones for the worker. */
  accept(owner: Owner, items: Item[]): { known: Scored[]; fresh: Item[] } {
    const known: Scored[] = [];
    const fresh: Item[] = [];
    for (const { id, text } of items) {
      const hit = this.scores.get(text);
      if (hit) {
        known.push({ id, ...hit });
        continue;
      }
      this.pending.set(this.nextId, { owner, id, text });
      fresh.push({ id: this.nextId++, text });
    }
    return { known, fresh };
  }

  /** Remembers the worker's results and hands them to their owners, under the owners' ids. */
  settle(results: Scored[]): Map<Owner, Scored[]> {
    const replies = new Map<Owner, Scored[]>();
    for (const { id, tokens, score } of results) {
      const request = this.pending.get(id);
      if (!request) continue; // cancelled, or its owner is gone
      this.pending.delete(id);
      this.scores.set(request.text, { tokens, score });
      const reply = replies.get(request.owner) ?? [];
      reply.push({ id: request.id, tokens, score });
      replies.set(request.owner, reply);
    }
    return replies;
  }

  /**
   * Forgets an owner's unanswered texts: the ones with these ids, or all of them. Returns
   * the host's ids of those texts, for the worker to drop.
   */
  cancel(owner: Owner, ids?: number[]): number[] {
    const wanted = ids && new Set(ids);
    const cancelled: number[] = [];
    for (const [hostId, request] of this.pending) {
      if (request.owner !== owner || (wanted && !wanted.has(request.id))) continue;
      this.pending.delete(hostId);
      cancelled.push(hostId);
    }
    return cancelled;
  }

  /** Forgets everything, the scores too: a new worker may run another backend. */
  clear(): void {
    this.pending.clear();
    this.scores.clear();
  }
}
