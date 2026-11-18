import type { DisplaySettings } from './settings';

/** Where this computer's power comes from; unknown where the browser cannot tell. */
export type Power = 'mains' | 'battery' | 'unknown';

/** The settings that decide whether texts are scored. */
export type ScoringSettings = Pick<DisplaySettings, 'enabled' | 'onlyOnMains'>;

/**
 * Whether texts are scored now: `score`, `score-unsure` (scored, but the power source is
 * unknown though it matters), or the reason they are not.
 */
export type Verdict = 'score' | 'score-unsure' | 'switched-off' | 'on-battery';

/** Whether texts may be scored now. The model host acts on this, and the popup shows it. */
export function mayScore(settings: ScoringSettings, power: Power): Verdict {
  if (!settings.enabled) return 'switched-off';
  if (!settings.onlyOnMains || power === 'mains') return 'score';
  return power === 'battery' ? 'on-battery' : 'score-unsure';
}

/** The verdict in words, for the popup; empty where there is nothing to explain. */
export function describeVerdict(verdict: Verdict): string {
  switch (verdict) {
    case 'score':
      return '';
    case 'score-unsure':
      return import.meta.env.FIREFOX
        ? 'Cannot tell whether this computer is plugged in, so texts are scored on battery too. Firefox needs the power helper for that: see the README.'
        : 'Cannot tell whether this computer is plugged in, so texts are scored on battery too.';
    case 'switched-off':
      return 'Switched off: nothing is scored.';
    case 'on-battery':
      return 'On battery: nothing is scored, and the model is unloaded until you plug in.';
  }
}
