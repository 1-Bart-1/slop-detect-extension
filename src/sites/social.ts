/**
 * What the training texts of the social sites lost on their way in (slopdetect's
 * `prompts/normalize/twitter.md` and `linkedin.md`), as far as rules can do what a language
 * model did there.
 */

const TAG = /#[\p{L}\p{N}_]+/u.source;
/** A paragraph, or the end of one, that is hashtags alone. */
const TAGS_AT_END = new RegExp(`(^|\\s)(${TAG}\\s*)+$`, 'u');
/** A hashtag that is a word of a sentence. */
const TAG_IN_TEXT = new RegExp(`(^|[\\s(])#([\\p{L}\\p{N}_]+)`, 'gu');
/** The handles a reply starts with. */
const HANDLES_AT_START = /^(@\w+\s+)+/;
/** `WomensHistoryMonth`, `LinkedInAds`: where a lower-case letter meets an upper-case one. */
const JOINED_WORDS = /(\p{Ll})(\p{Lu})/gu;

/**
 * Hashtags as the training texts had them: the ones after the last sentence of a
 * paragraph deleted, the ones inside a sentence as plain words. `split` parts the words a
 * tag joins, which was done for LinkedIn only.
 */
export function plainHashtags(markdown: string, split: boolean): string {
  return markdown
    .split('\n\n')
    .map((paragraph) =>
      paragraph
        .replace(TAGS_AT_END, '')
        .replace(TAG_IN_TEXT, (_, before: string, word: string) => before + (split ? word.replace(JOINED_WORDS, '$1 $2') : word)),
    )
    .filter(Boolean)
    .join('\n\n');
}

/** A reply without the handles of the people it answers. */
export const withoutLeadingHandles = (markdown: string) => markdown.replace(HANDLES_AT_START, '');
