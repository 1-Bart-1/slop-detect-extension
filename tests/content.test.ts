import { describe, expect, test } from 'vitest';
import { verdict } from '@/src/content/verdict';
import { ScoreCache } from '@/src/host/cache';
import type { Bands } from '@/src/protocol';
import { siteOf } from '@/src/sites';

const BANDS: Bands = { human_max: 0.15, flag_min: 0.41, generated_min: 0.75 };

describe('verdict', () => {
  test('human below the flag threshold, AI from the generated threshold on', () => {
    expect(verdict(0.04, BANDS, false)).toEqual({ band: 'human', label: 'Human: 0.04' });
    expect(verdict(0.4, BANDS, false)?.band).toBe('human');
    expect(verdict(0.75, BANDS, false)).toEqual({ band: 'ai', label: 'AI: 0.75' });
    expect(verdict(0.999, BANDS, false)?.label).toBe('AI: 1.00');
  });

  test('the band between them has a badge only on request', () => {
    expect(verdict(0.41, BANDS, false)).toBeNull();
    expect(verdict(0.74, BANDS, false)).toBeNull();
    expect(verdict(0.6, BANDS, true)).toEqual({ band: 'edited', label: 'AI-edited: 0.60' });
  });
});

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

describe('siteOf', () => {
  test('finds a site by its host and its subdomains', () => {
    expect(siteOf('www.reddit.com')?.name).toBe('reddit');
    expect(siteOf('old.reddit.com')?.name).toBe('reddit');
    expect(siteOf('reddit.com')?.name).toBe('reddit');
  });

  test('a host that only ends in the same letters is another site', () => {
    expect(siteOf('notreddit.com')).toBeUndefined();
    expect(siteOf('example.org')).toBeUndefined();
  });
});
