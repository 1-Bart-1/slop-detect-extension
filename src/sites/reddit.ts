import type { Site } from './types';

/**
 * reddit.com builds its pages from web components with stable tag names; the text of a
 * post or comment is ordinary markup in a named slot. Checked against the live site on
 * 2026-11-16:
 *
 * - a post's `slot="text-body"` is on two nested elements. The outer one,
 *   `shreddit-post-text-body`, draws only its slotted children, so a badge inside it has
 *   no size: the text element is the inner one.
 * - a comment's body is some levels below `shreddit-comment`, and its replies are further
 *   down, in `#comment-children`. The first `slot="comment"` in the comment is its own.
 *
 * old.reddit.com is plain markup with `.thing` containers, replies nested in their parent.
 */
export const reddit: Site = {
  name: 'reddit',
  label: 'Reddit',
  matches: ['*://*.reddit.com/*'],
  hosts: ['reddit.com'],
  blocks: [
    { name: 'post', item: 'shreddit-post', text: ':scope shreddit-post-text-body > [slot="text-body"]' },
    { name: 'comment', item: 'shreddit-comment', text: ':scope [slot="comment"]' },
    { name: 'old post', item: '.thing.link', text: ':scope > .entry .usertext-body > .md' },
    { name: 'old comment', item: '.thing.comment', text: ':scope > .entry .usertext-body > .md' },
  ],
};
