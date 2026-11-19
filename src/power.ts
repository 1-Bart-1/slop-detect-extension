import type { DisplaySettings } from './settings';

/** Where this computer's power comes from; unknown where the browser cannot tell. */
export type Power = 'mains' | 'battery' | 'unknown';

/** The settings that decide whether texts are scored. */
export type ScoringSettings = Pick<DisplaySettings, 'enabled' | 'onlyOnMains'>;

/** Whether texts are scored now, and whether the setting to score only while plugged in is offered. */
export interface Verdict {
  /** `score`, or the reason texts are not scored. */
  scoring: 'score' | 'switched-off' | 'on-battery';
  /** False where the power source cannot be read, so the setting could not act. */
  batterySetting: boolean;
}

/** Whether texts may be scored now. The model host acts on this, and the popup shows it. */
export function mayScore(settings: ScoringSettings, power: Power): Verdict {
  const batterySetting = power !== 'unknown';
  if (!settings.enabled) return { scoring: 'switched-off', batterySetting };
  const onBattery = settings.onlyOnMains && power === 'battery';
  return { scoring: onBattery ? 'on-battery' : 'score', batterySetting };
}

/** Why texts are not scored, in words, for the popup; empty while they are. */
export function describeVerdict(verdict: Verdict): string {
  switch (verdict.scoring) {
    case 'score':
      return '';
    case 'switched-off':
      return 'Switched off: nothing is scored.';
    case 'on-battery':
      return 'On battery: nothing is scored, and the model is unloaded until you plug in.';
  }
}
