import { expect, test } from 'vitest';
import { mayScore } from '@/src/power';

const on = { enabled: true, onlyOnMains: true };

test('scores while plugged in', () => {
  expect(mayScore(on, 'mains')).toBe('score');
});

test('scores nothing on battery', () => {
  expect(mayScore(on, 'battery')).toBe('on-battery');
});

test('scores when the power source is unknown, and says it cannot tell', () => {
  expect(mayScore(on, 'unknown')).toBe('score-unsure');
});

test('scores on battery too with the setting off, and then the power source does not matter', () => {
  const anyPower = { enabled: true, onlyOnMains: false };
  expect(mayScore(anyPower, 'battery')).toBe('score');
  expect(mayScore(anyPower, 'unknown')).toBe('score');
});

test('the master switch off scores nothing, whatever the power source', () => {
  for (const onlyOnMains of [true, false]) {
    for (const power of ['mains', 'battery', 'unknown'] as const) {
      expect(mayScore({ enabled: false, onlyOnMains }, power)).toBe('switched-off');
    }
  }
});
