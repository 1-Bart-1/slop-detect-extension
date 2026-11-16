import { plainHashtags } from './social';
import type { Site } from './types';

/** A comment, under a post of the feed. */
const COMMENT = '[componentkey^="replaceableComment_"]';
/** The text of a post or a comment. */
const TEXT = '[data-testid="expandable-text-box"]';

/**
 * linkedin.com has generated class names, and the `data-view-name` attributes that name
 * the parts of a post are there on some page loads and not on others. The selectors go by
 * what both kinds of load had on 2026-11-16, in the main feed and on the page of one post:
 *
 * - a post is a list item of a `LazyColumn`, a comment has a `componentkey` that starts with
 *   `replaceableComment_`. The text of both is an `expandable-text-box`, which holds the
 *   whole text while it shows two or three lines of it, and a "more" button at its end,
 *   which is not part of the text. A post without text of its own may show a comment: the
 *   comment's text is not the post's.
 * - the lines under an author's name are unnamed. On a post, the last of them (the time,
 *   or "Promoted") is the one line that a link follows; on a comment the time follows the
 *   link with the author. The badge goes into the line, after its text: the line is a
 *   block of its own.
 * - a post shared inside another post is not marked: the outer post's text comes first.
 */
export const linkedin: Site = {
  name: 'linkedin',
  label: 'LinkedIn',
  matches: ['*://*.linkedin.com/*'],
  hosts: ['linkedin.com'],
  blocks: [
    {
      name: 'post',
      item: '[data-component-type="LazyColumn"] [role="listitem"]',
      text: `:scope ${TEXT}:not(${COMMENT} *)`,
      anchor: ':scope div:has(> p):has(+ a) > p > span',
    },
    {
      name: 'comment',
      item: COMMENT,
      text: `:scope ${TEXT}`,
      anchor: ':scope a + div > p > span',
    },
  ],
  skip: '[data-testid="expandable-text-button"]',
  tidy: (markdown) => plainHashtags(markdown, true),
};
