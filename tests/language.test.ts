import { expect, test } from 'vitest';
import { english } from '@/src/content/language';

test('a text the detector is sure of is taken by its main language', () => {
  expect(english({ isReliable: true, languages: [{ language: 'en', percentage: 98 }] })).toBe(true);
  expect(english({ isReliable: true, languages: [{ language: 'de', percentage: 97 }] })).toBe(false);
  const mixed = [
    { language: 'en', percentage: 30 },
    { language: 'ru', percentage: 68 },
  ];
  expect(english({ isReliable: true, languages: mixed })).toBe(false);
});

test('a text the detector is not sure of is scored', () => {
  expect(english({ isReliable: false, languages: [{ language: 'de', percentage: 60 }] })).toBe(true);
  expect(english({ isReliable: false, languages: [] })).toBe(true);
  expect(english({ isReliable: true, languages: [] })).toBe(true);
});
