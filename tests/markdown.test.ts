import { parseHTML } from 'linkedom';
import { expect, test } from 'vitest';
import { type Look, toMarkdown } from '@/src/content/markdown';
import { plainHashtags, withoutLeadingHandles } from '@/src/sites/social';

const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'h1', 'h2', 'h3']);

/** No layout here: block by tag, the author's line breaks by a class, hidden by the attribute. */
const look = (element: Element): Look => ({
  hidden: element.hasAttribute('hidden'),
  block: BLOCK.has(element.localName),
  pre: element.closest('.pre') !== null,
});

function markdown(html: string, skip?: string): string {
  const { document } = parseHTML(`<html><body><div id="text">${html}</div></body></html>`);
  return toMarkdown(document.getElementById('text')!, { skip, host: 'www.reddit.com', look });
}

test('paragraphs are a blank line apart, and so are line breaks', () => {
  expect(markdown('<p>One\n   line.</p><p>Two.<br>Three.</p>')).toBe('One line.\n\nTwo.\n\nThree.');
  expect(markdown('<span class="pre">One.\nTwo.\n\nThree.</span>')).toBe('One.\n\nTwo.\n\nThree.');
  expect(markdown('<p>no&nbsp;break &nbsp; spaces</p>')).toBe('no break spaces');
});

test('bold, italic, strike and inline code keep their marks', () => {
  expect(markdown('<p>a <strong>bold </strong>and <em>slanted</em> <del>old</del> <code>x = 1</code></p>')).toBe(
    'a **bold** and *slanted* ~~old~~ `x = 1`',
  );
});

test('lists have markers, nested ones are indented', () => {
  expect(markdown('<ul><li>one</li><li>two<ul><li>inner</li></ul></li></ul>')).toBe('- one\n- two\n  - inner');
  expect(markdown('<ol><li>one</li><li>two</li></ol>')).toBe('1. one\n2. two');
  expect(markdown('<ul><li><p>one</p></li><li><p>two</p><p>more</p></li></ul>')).toBe('- one\n\n- two\n\n  more');
});

test('quotes, headings and code blocks', () => {
  expect(markdown('<blockquote><p>said</p><p>twice</p></blockquote><p>reply</p>')).toBe('> said\n>\n> twice\n\nreply');
  expect(markdown('<h2>Setup</h2><p>text</p>')).toBe('## Setup\n\ntext');
  expect(markdown('<p>run</p><pre><code>a = 1\nb = 2\n</code></pre>')).toBe('run\n\n```\na = 1\nb = 2\n```');
});

test('a link with a text of its own keeps its address, a link that is an address is the full one', () => {
  expect(markdown('<p>see <a href="https://example.org/a">the docs</a></p>')).toBe('see [the docs](https://example.org/a)');
  expect(markdown('<p><a href="https://example.org/a/long/path">https://example.org/a/lo...</a></p>')).toBe(
    'https://example.org/a/long/path',
  );
  expect(markdown('<p><a href="https://t.co/abc"><span>https://</span>example.org/pa<span>…</span></a></p>')).toBe(
    'https://t.co/abc',
  );
  expect(markdown('<p><a href="https://t.co/abc">example.org/page</a></p>')).toBe('https://t.co/abc');
});

test('bold inside a link is the site drawing the link: no marks, and a whole address stays as written', () => {
  expect(markdown('<span>Read: <a href="https://www.linkedin.com/safety/go/?url=x"><strong>https://lnkd.in/abc</strong></a></span>')).toBe(
    'Read: https://lnkd.in/abc',
  );
  expect(markdown('<span>on <a href="https://www.reddit.com/search?q=ai"><strong>#AI</strong></a> today</span>')).toBe('on #AI today');
});

test('a link to the same site is a mention: its text alone', () => {
  expect(markdown('<p>ask <a href="https://www.reddit.com/r/selfhosted">r/selfhosted</a></p>')).toBe('ask r/selfhosted');
  expect(markdown('<p>by <a href="/user/someone">u/someone</a></p>')).toBe('by u/someone');
});

test('an emoji that is an image is its alt text, other images are left out', () => {
  expect(markdown('<span>hot <img alt="🔥" src="e.svg"> take <img alt="image" src="p.png"></span>')).toBe('hot 🔥 take');
});

test('skipped and hidden elements are not part of the text', () => {
  expect(markdown('<span>The start<button class="more">… more</button></span>', '.more')).toBe('The start');
  expect(markdown('<p>seen<span hidden> unseen</span></p>')).toBe('seen');
});

test('a table', () => {
  expect(markdown('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>')).toBe(
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
  );
});

test('hashtags after the last sentence go, the ones in a sentence are words', () => {
  expect(plainHashtags('Loving the #AI talk today. #startups #growth', false)).toBe('Loving the AI talk today.');
  expect(plainHashtags('First.\n\n#one #two\n\nLast for #WomensHistoryMonth here.', true)).toBe(
    'First.\n\nLast for Womens History Month here.',
  );
  expect(plainHashtags('## A heading\n\nIssue #12 is fixed', false)).toBe('## A heading\n\nIssue 12 is fixed');
});

test('a reply loses the handles it starts with, not the ones in a sentence', () => {
  expect(withoutLeadingHandles('@jack @sarah I agree with @jack')).toBe('I agree with @jack');
});
