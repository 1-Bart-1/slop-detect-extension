import { expect, test } from 'vitest';
import { siteOf } from '@/src/sites';

test('finds a site by its host and its subdomains', () => {
  expect(siteOf('www.reddit.com')?.name).toBe('reddit');
  expect(siteOf('old.reddit.com')?.name).toBe('reddit');
  expect(siteOf('reddit.com')?.name).toBe('reddit');
  expect(siteOf('www.linkedin.com')?.name).toBe('linkedin');
  expect(siteOf('news.ycombinator.com')?.name).toBe('hackernews');
});

test('a host that only ends in the same letters is another site', () => {
  expect(siteOf('notreddit.com')).toBeUndefined();
  expect(siteOf('example.org')).toBeUndefined();
});
