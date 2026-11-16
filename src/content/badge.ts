import type { Verdict } from './verdict';

/** Marks the badge's host element, so a block never gets two. */
const MARK = 'data-slop-detect';

const STYLE = `
  span {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 9px;
    font: 600 11px/16px system-ui, sans-serif;
    letter-spacing: 0.02em;
    color: #fff;
  }
  .ai { background: #c0392b; }
  .edited { background: #b7791f; }
  .human { background: #2f855a; }
`;

/**
 * Puts the badge at the top of a text block, or takes it away with a null verdict. It
 * lives in a shadow root: the page's styles do not reach it, and it adds nothing to the
 * block's `innerText`, which is what gets scored.
 */
export function showBadge(block: Element, verdict: Verdict | null, title = ''): void {
  let host = block.querySelector<HTMLElement>(`:scope > [${MARK}]`);
  if (!verdict) {
    host?.remove();
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(MARK, '');
    host.style.cssText = 'display:block;margin:0 0 4px;line-height:1';
    host.attachShadow({ mode: 'open' }).innerHTML = `<style>${STYLE}</style><span></span>`;
    block.prepend(host);
  }
  const pill = host.shadowRoot!.querySelector('span')!;
  pill.className = verdict.band;
  pill.textContent = verdict.label;
  pill.title = title;
}

/** True for the nodes the badges add: the scanner ignores its own changes to the page. */
export const isBadge = (node: Node) => node instanceof Element && node.hasAttribute(MARK);
