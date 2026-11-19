import { expect, test } from 'vitest';
import { mayScore } from '@/src/power';

const on = { enabled: true, onlyOnMains: true };

test('scores while plugged in', () => {
  expect(mayScore(on, 'mains')).toEqual({ scoring: 'score', batterySetting: true });
});

test('scores nothing on battery', () => {
  expect(mayScore(on, 'battery')).toEqual({ scoring: 'on-battery', batterySetting: true });
});

test('where the power source cannot be read, scores and offers no battery setting', () => {
  expect(mayScore(on, 'unknown')).toEqual({ scoring: 'score', batterySetting: false });
});

test('scores on battery too with the setting off', () => {
  expect(mayScore({ enabled: true, onlyOnMains: false }, 'battery').scoring).toBe('score');
});

test('the master switch off scores nothing, whatever the power source', () => {
  for (const onlyOnMains of [true, false]) {
    for (const power of ['mains', 'battery', 'unknown'] as const) {
      expect(mayScore({ enabled: false, onlyOnMains }, power).scoring).toBe('switched-off');
    }
  }
});

test('the battery setting is offered wherever the power source can be read, switched on or off', () => {
  for (const enabled of [true, false]) {
    for (const power of ['mains', 'battery'] as const) {
      expect(mayScore({ enabled, onlyOnMains: true }, power).batterySetting).toBe(true);
    }
    expect(mayScore({ enabled, onlyOnMains: true }, 'unknown').batterySetting).toBe(false);
  }
});
