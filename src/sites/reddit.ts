import type { Site } from './types';

/**
 * reddit.com builds its pages from web components with stable tag names; the text of a
 * post or comment is ordinary markup in a named slot. Checked against the live site on
 * 2026-11-16, a feed and a thread:
 *
 * - a post's text is the `.md` element in `shreddit-post-text-body`: the full text on a
 *   thread, next to a "Read more" button that is not part of it, and a preview in a feed.
 *   Its metadata line is the `credit-bar` slot, with the time in `faceplate-timeago`.
 * - a comment's body is some levels below `shreddit-comment`, and its replies are further
 *   down, in `#comment-children`: the first `slot="comment"` and the first
 *   `slot="commentMeta"` in the comment are its own. The time on the metadata line is
 *   inside a link, which the badge follows so that it is not part of the link.
 *
 * old.reddit.com is plain markup with `.thing` containers, replies nested in their parent.
 * Not checked against the live site.
 */
export const reddit: Site = {
  name: 'reddit',
  label: 'Reddit',
  matches: ['*://*.reddit.com/*'],
  hosts: ['reddit.com'],
  blocks: [
    {
      name: 'post',
      item: 'shreddit-post',
      text: ':scope shreddit-post-text-body .md',
      anchor: ':scope [slot="credit-bar"] faceplate-timeago',
    },
    {
      name: 'comment',
      item: 'shreddit-comment',
      text: ':scope [slot="comment"]',
      anchor: ':scope [slot="commentMeta"] a:has(faceplate-timeago)',
    },
    {
      name: 'old post',
      item: '.thing.link',
      text: ':scope > .entry .usertext-body > .md',
      anchor: ':scope > .entry .tagline time',
    },
    {
      name: 'old comment',
      item: '.thing.comment',
      text: ':scope > .entry .usertext-body > .md',
      anchor: ':scope > .entry .tagline time',
    },
  ],
};
