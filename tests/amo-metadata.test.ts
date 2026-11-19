import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Field lists of AMO's add-on create and version create requests (addons-server API v5 docs).
const ADDON_FIELDS = [
  'categories', 'contributions_url', 'default_locale', 'description', 'developer_comments',
  'homepage', 'is_disabled', 'is_experimental', 'name', 'requires_payment', 'slug', 'summary',
  'support_email', 'tags', 'version',
];
const VERSION_FIELDS = [
  'approval_notes', 'compatibility', 'license', 'custom_license', 'release_notes', 'source',
  'upload',
];
const FIREFOX_CATEGORIES = [
  'alerts-updates', 'appearance', 'bookmarks', 'download-management', 'feeds-news-blogging',
  'games-entertainment', 'language-support', 'photos-music-videos', 'privacy-security',
  'search-tools', 'shopping', 'social-communication', 'tabs', 'web-development', 'other',
];

const metadata = JSON.parse(readFileSync('amo-metadata.json', 'utf8'));

test('the AMO listing names only fields the add-on API takes', () => {
  expect(ADDON_FIELDS).toEqual(expect.arrayContaining(Object.keys(metadata)));
  expect(VERSION_FIELDS).toEqual(expect.arrayContaining(Object.keys(metadata.version)));
});

test('the AMO listing has what a first listed version needs', () => {
  expect(metadata.name['en-US']).toBe('Slop Detect');
  expect(metadata.summary['en-US'].length).toBeLessThanOrEqual(250);
  expect(FIREFOX_CATEGORIES).toEqual(expect.arrayContaining(metadata.categories.firefox));
  expect(metadata.categories.firefox.length).toBeGreaterThan(0);
  expect(metadata.version.license).toBe('all-rights-reserved');
});
