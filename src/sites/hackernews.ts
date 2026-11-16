import type { Site } from './types';

/**
 * news.ycombinator.com is tables with stable class names. Checked against the live site
 * on 2026-11-16, an "Ask HN" thread:
 *
 * - the text of a submission (Ask HN, Tell HN, Show HN) is `.toptext` in the `fatitem`
 *   table at the top of its page, and its metadata line is `.subline`. A submission that
 *   is only a link has no text. The lists of submissions show no text at all.
 * - a comment is a `tr.athing` row with a `.commtext`, and its metadata line is
 *   `.comhead`. Replies are rows of their own, indented, not nested in their parent.
 * - the time on both lines is `.age`.
 */
export const hackernews: Site = {
  name: 'hackernews',
  label: 'Hacker News',
  matches: ['*://news.ycombinator.com/*'],
  hosts: ['news.ycombinator.com'],
  blocks: [
    {
      name: 'post',
      item: 'table.fatitem',
      text: ':scope .toptext',
      anchor: ':scope .subline .age',
    },
    {
      name: 'comment',
      item: 'tr.athing',
      text: ':scope .commtext',
      anchor: ':scope .comhead .age',
    },
  ],
};
