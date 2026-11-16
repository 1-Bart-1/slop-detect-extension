import { expect, test } from 'vitest';
import { verdict } from '@/src/content/verdict';
import type { Bands } from '@/src/protocol';

const BANDS: Bands = { human_max: 0.15, flag_min: 0.41, generated_min: 0.75 };

test('human below the flag threshold, AI from the generated threshold on', () => {
  expect(verdict(0.04, BANDS, false)).toEqual({ band: 'human', label: 'Human 0.04' });
  expect(verdict(0.4, BANDS, false)?.band).toBe('human');
  expect(verdict(0.75, BANDS, false)).toEqual({ band: 'ai', label: 'AI 0.75' });
  expect(verdict(0.999, BANDS, false)?.label).toBe('AI 1.00');
});

test('the band between them has a badge only on request', () => {
  expect(verdict(0.41, BANDS, false)).toBeNull();
  expect(verdict(0.74, BANDS, false)).toBeNull();
  expect(verdict(0.6, BANDS, true)).toEqual({ band: 'edited', label: 'AI-edited 0.60' });
});
