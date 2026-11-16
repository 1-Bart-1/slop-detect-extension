/**
 * A site's rendered text as the markdown the model was trained on (slopdetect's normalize
 * stage and `markdown.py`): paragraphs a blank line apart, `- ` and `1.` lists, `> ` quotes,
 * fenced code, `**bold**`, `*italic*`, and links as `[text](url)` or the bare URL.
 * `innerText` has none of these marks, drops emoji that are images, and shows a long URL
 * cut short.
 *
 * Not done: escaping of characters that are markdown in plain text (a literal `*`).
 */

/** What the walk needs of an element's style. */
export interface Look {
  /** Not drawn at all. */
  hidden: boolean;
  /** Starts a block of its own: a paragraph, as opposed to a piece of a line. */
  block: boolean;
  /** Line breaks in its text are the author's, not the markup's. */
  pre: boolean;
}

export interface Options {
  /** Selects elements inside the text that are not part of it. */
  skip?: string;
  /** The page's host: a link with a text of its own to the same site is a mention, and loses its URL. */
  host?: string;
  /** In the browser, the computed style. */
  look?: (element: Element) => Look;
}

/** `marks` is off inside a link: bold there is how a site draws its links, not the author's. */
type Context = Required<Options> & { marks: boolean };

const computedLook = (element: Element): Look => {
  const { display, whiteSpace } = getComputedStyle(element);
  return {
    hidden: display === 'none',
    block: !display.startsWith('inline') && display !== 'contents',
    pre: whiteSpace.startsWith('pre') || whiteSpace === 'break-spaces',
  };
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
/** Inline marks, by tag. */
const MARKS: Record<string, string> = { strong: '**', b: '**', em: '*', i: '*', del: '~~', s: '~~', strike: '~~' };
const HEADING = /^h([1-6])$/;
/** An alt text that says nothing: such an image is left out. */
const NO_ALT = /^(image|screenshot|enter image description here|\S+\.(png|jpe?g|gif|webp))?$/i;
/** A link text that is the address itself, whole or cut short. */
const URL_TEXT = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?(…|\.\.\.)?$/;
/** The whole address, as the author gave it. */
const WHOLE_URL = /^https?:\/\/\S*(?<!…|\.\.\.)$/;

export function toMarkdown(root: Element, options: Options = {}): string {
  const context: Context = {
    skip: options.skip ?? '',
    host: options.host ?? location.hostname,
    look: options.look ?? computedLook,
    marks: true,
  };
  return blocksOf(root, context).join('\n\n');
}

/** The children of `parent` as blocks: its own lines become paragraphs between the block children. */
function blocksOf(parent: Element, context: Context): string[] {
  const blocks: string[] = [];
  const pre = context.look(parent).pre;
  let line = '';
  const flush = () => {
    blocks.push(...paragraphs(line));
    line = '';
  };
  for (const node of parent.childNodes) {
    if (node.nodeType === TEXT_NODE) line += textOf(node, pre);
    if (node.nodeType !== ELEMENT_NODE) continue;
    const element = node as Element;
    if (left(element, context)) continue;
    const block = blockOf(element, context);
    if (block) {
      flush();
      blocks.push(...block);
    } else {
      line += inline(element, context);
    }
  }
  flush();
  return blocks;
}

/** Not part of the text: skipped by the site, or not drawn. */
const left = (element: Element, context: Context) =>
  (context.skip !== '' && element.matches(context.skip)) || context.look(element).hidden;

/** A line break is a paragraph break, as in the training texts; what is left of a line loses its extra spaces. */
function paragraphs(line: string): string[] {
  return line
    .split(/\n+/)
    // Every kind of space, the no-break one too.
    .map((part) => part.replace(/[\t\p{Zs}]+/gu, ' ').trim())
    .filter(Boolean);
}

/** In ordinary markup a newline is a space; where the author's breaks are kept, it is a break. */
function textOf(node: Node, pre: boolean): string {
  const text = node.nodeValue ?? '';
  return pre ? text.replace(/\r\n?/g, '\n') : text.replace(/\s+/g, ' ');
}

/** The blocks of a block element, or null for an element that is part of a line. */
function blockOf(element: Element, context: Context): string[] | null {
  const tag = element.localName;
  if (tag === 'ul' || tag === 'ol') return [list(element, context)];
  if (tag === 'blockquote') return [prefixed(blocksOf(element, context).join('\n\n'), '> ')];
  if (tag === 'pre') return [`\`\`\`\n${(element.textContent ?? '').replace(/\n+$/, '')}\n\`\`\``];
  if (tag === 'table') return [table(element, context)];
  if (tag === 'hr') return [];
  const heading = HEADING.exec(tag);
  if (heading) return paragraphs(inlineChildren(element, context)).map((text) => `${'#'.repeat(Number(heading[1]))} ${text}`);
  // A paragraph by its tag too: Reddit draws the ones of a feed preview inline.
  return tag === 'p' || context.look(element).block ? blocksOf(element, context) : null;
}

function inline(element: Element, context: Context): string {
  const tag = element.localName;
  if (tag === 'br') return '\n';
  if (tag === 'img') return alt(element);
  if (tag === 'a') return link(element, context);
  if (tag === 'code') return `\`${element.textContent ?? ''}\``;
  const inner = inlineChildren(element, context);
  const mark = MARKS[tag];
  if (!mark || !context.marks || !inner.trim()) return inner;
  // The spaces around a marked run stay outside the marks, where markdown wants them.
  const [, before = '', core = '', after = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? [];
  return `${before}${mark}${core}${mark}${after}`;
}

function inlineChildren(parent: Element, context: Context): string {
  const pre = context.look(parent).pre;
  let line = '';
  for (const node of parent.childNodes) {
    if (node.nodeType === TEXT_NODE) line += textOf(node, pre);
    else if (node.nodeType === ELEMENT_NODE && !left(node as Element, context)) line += inline(node as Element, context);
  }
  return line;
}

/** An emoji that is an image is its alt text. */
function alt(image: Element): string {
  const text = image.getAttribute('alt') ?? '';
  return NO_ALT.test(text) ? '' : text;
}

function link(anchor: Element, context: Context): string {
  const text = inlineChildren(anchor, { ...context, marks: false }).replace(/\s+/g, ' ').trim();
  // LinkedIn sends a link through an address of its own: the one in the text is the author's.
  if (WHOLE_URL.test(text)) return text;
  const url = URL.parse(anchor.getAttribute('href') ?? '', anchor.baseURI || undefined);
  if (!url || !/^https?:$/.test(url.protocol)) return text;
  // The address the link goes to, not the short form the site shows.
  if (URL_TEXT.test(text)) return url.href;
  // A mention, a tag, a community: the site made the link, not the author.
  if (!text || sameSite(url.hostname, context.host)) return text;
  return `[${text}](${url.href})`;
}

/** By the last two labels of the host names: `old.reddit.com` and `www.reddit.com`. */
function sameSite(one: string, other: string): boolean {
  const site = (host: string) => host.split('.').slice(-2).join('.');
  return site(one) === site(other);
}

function list(element: Element, context: Context): string {
  const items = [...element.children].filter((child) => child.localName === 'li');
  // A list whose items are paragraphs has blank lines between them.
  const gap = items.some((item) => [...item.children].some((child) => child.localName === 'p')) ? '\n\n' : '\n';
  let number = Number(element.getAttribute('start')) || 1;
  return items
    .map((item) => {
      const marker = element.localName === 'ol' ? `${number++}. ` : '- ';
      return marker + indented(blocksOf(item, context).join(gap), marker.length);
    })
    .join(gap);
}

/** Every line after the first moved in by `width`; blank lines stay empty. */
const indented = (text: string, width: number) => text.replace(/\n(?!\n)/g, `\n${' '.repeat(width)}`);

/** Every line behind `prefix`, as in a quote. */
const prefixed = (text: string, prefix: string) =>
  text
    .split('\n')
    .map((line) => (line ? prefix + line : prefix.trimEnd()))
    .join('\n');

function table(element: Element, context: Context): string {
  const rows = [...element.querySelectorAll('tr')].map((row) =>
    [...row.children].map((cell) => inlineChildren(cell, context).replace(/\s+/g, ' ').trim()),
  );
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const [head, ...body] = rows;
  if (!head) return '';
  return [line(head), line(head.map(() => '---')), ...body.map(line)].join('\n');
}
