import type { Verdict } from './verdict';

/** Marks the badge's host element: the scanner ignores its own changes to the page. */
const MARK = 'data-slop-detect';

/**
 * A chip the size of the ones a site puts on its metadata lines. `--tone` is the band's
 * colour: the dot has it, the fill is a faint tint of it, and the text is it mixed with
 * the line's own text colour, so the chip reads on a light and on a dark page alike.
 */
const STYLE = `
  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 16px;
    padding: 0 6px;
    border-radius: 8px;
    font: 400 12px/16px system-ui, sans-serif;
    font-family: inherit;
    white-space: nowrap;
    cursor: default;
    color: color-mix(in srgb, var(--tone) 70%, currentColor);
    background: color-mix(in srgb, var(--tone) 14%, transparent);
  }
  span::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tone);
  }
  .ai { --tone: #e5383b; }
  .edited { --tone: #d98e04; }
  /* Most texts are human: no fill and the line's own colour, so a page is not full of pills. */
  .human { --tone: #2f9e5b; color: inherit; background: none; padding: 0; }
`;

/** On a metadata line, after the element it follows. */
const INLINE = 'display:inline-flex;align-items:center;flex:none;margin-inline-start:6px;vertical-align:middle';
/** At the top of the text, when the item has no metadata line. */
const ABOVE = 'display:flex;margin:0 0 4px';

/** A badge that says what the verdict says, not yet in the page. */
export function createBadge(): HTMLElement {
  const badge = document.createElement('span');
  badge.setAttribute(MARK, '');
  // A shadow root: the page's styles do not reach the chip, and its text is not part of
  // any `innerText`, which is what gets scored.
  badge.attachShadow({ mode: 'open' }).innerHTML = `<style>${STYLE}</style><span></span>`;
  return badge;
}

export function paintBadge(badge: HTMLElement, verdict: Verdict, title: string): void {
  const chip = badge.shadowRoot!.querySelector('span')!;
  chip.className = verdict.band;
  chip.textContent = verdict.label;
  chip.title = title;
}

/** Puts the badge right after `anchor`, or at the top of `text` when there is no anchor. */
export function placeBadge(badge: HTMLElement, anchor: Element | null, text: Element): void {
  badge.style.cssText = anchor ? INLINE : ABOVE;
  if (anchor) anchor.after(badge);
  else text.prepend(badge);
}

export const isBadge = (node: Node) => node instanceof Element && node.hasAttribute(MARK);
