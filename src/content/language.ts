import type { Item } from '@/src/protocol';

/** What the browser's language detector says about a text. */
export interface Detected {
  /** False for a text that is short, mixed, or mostly names, links and code. */
  isReliable: boolean;
  languages: { language: string; percentage: number }[];
}

/**
 * Whether a text goes to the model, which was trained on English. A text the detector is
 * not sure of does: a badge too many is better than one missing.
 */
export function english({ isReliable, languages }: Detected): boolean {
  if (!isReliable) return true;
  const main = languages.reduce<Detected['languages'][number] | undefined>(
    (top, next) => (top && top.percentage >= next.percentage ? top : next),
    undefined,
  );
  return !main || main.language === 'en';
}

/** The items in English, by the detector that is part of the browser: no text leaves it. */
export async function onlyEnglish(items: Item[]): Promise<Item[]> {
  const kept = await Promise.all(items.map(async (item) => english(await browser.i18n.detectLanguage(item.text))));
  return items.filter((_, index) => kept[index]);
}
