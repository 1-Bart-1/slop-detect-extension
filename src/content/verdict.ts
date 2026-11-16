import type { Bands } from '@/src/protocol';

export type Band = 'human' | 'edited' | 'ai';

export interface Verdict {
  band: Band;
  /** What the badge says, e.g. `AI 0.93`. */
  label: string;
}

const NAMES: Record<Band, string> = { human: 'Human', edited: 'AI-edited', ai: 'AI' };

/**
 * The badge of a score, or null for none. Below the flag threshold a text reads as human,
 * from the generated threshold on as AI; the band between them gets a badge only on request.
 */
export function verdict(score: number, bands: Bands, showMiddle: boolean): Verdict | null {
  const band: Band = score >= bands.generated_min ? 'ai' : score < bands.flag_min ? 'human' : 'edited';
  if (band === 'edited' && !showMiddle) return null;
  return { band, label: `${NAMES[band]} ${score.toFixed(2)}` };
}
