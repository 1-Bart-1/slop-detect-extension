import { plainHashtags, withoutLeadingHandles } from './social';
import type { Site } from './types';

/**
 * x.com has generated class names and stable `data-testid` attributes. Checked against
 * the live site on 2026-11-16, the home timeline and the page of one post:
 *
 * - every post, a reply too, is an `article` with the test id `tweet`, and its text is
 *   `tweetText`. A quoted post is not an article: it is a block with the role `link`
 *   inside the post that quotes it, and its text is not the outer post's.
 * - a long post in a timeline holds only the start of its text, up to "Show more"; the
 *   page of the post holds all of it.
 * - an emoji in a text is an image, and a link shows a short form of its address.
 * - the time is a link: next to the author's name in a timeline, and under the text on
 *   the page of the post. An ad has no time, and a quoted post's time is not a link.
 */
export const twitter: Site = {
  name: 'twitter',
  label: 'X (Twitter)',
  matches: ['*://x.com/*', '*://*.x.com/*', '*://*.twitter.com/*'],
  hosts: ['x.com', 'twitter.com'],
  blocks: [
    {
      name: 'post',
      item: 'article[data-testid="tweet"]',
      text: ':scope [data-testid="tweetText"]:not([role="link"] *)',
      anchor: ':scope a:has(> time)',
    },
  ],
  tidy: (markdown) => plainHashtags(withoutLeadingHandles(markdown), false),
};
