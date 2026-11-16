import type { Bands, Item, Scored } from '@/src/protocol';
import type { Site } from '@/src/sites/types';
import { createBadge, isBadge, paintBadge, placeBadge } from './badge';
import { verdict } from './verdict';

/** Where the scanner sends texts. The entrypoint backs it with the port to the model host. */
export interface Link {
  score(items: Item[]): void;
  cancel(ids: number[]): void;
}

/** One post or comment of the page. */
interface Block {
  id: number;
  /** The element that holds the text. */
  element: HTMLElement;
  /** Finds the element the badge follows, which the site may add after the text. */
  anchor(): Element | null;
  /** In the page while the block has a verdict to show. */
  badge: HTMLElement | null;
  /** Inside the viewport or within a screen of it. */
  near: boolean;
  /** Handed to the host and not cancelled. */
  sent: boolean;
  /** Length of the element's text when it was sent: a different length means an edit or an expansion. */
  length: number;
  result: Scored | null;
}

/** Changes of the page are collected for this long before it is scanned again. */
const RESCAN_MS = 300;
/** Blocks that come into view together go to the host as one message. */
const SEND_MS = 100;

/**
 * Finds the site's text blocks, sends the ones near the viewport to be scored, and badges
 * them. Blocks that scroll away before their turn are cancelled; a page that adds content
 * as it is scrolled is scanned again after each change.
 */
export class Scanner {
  private readonly blocks = new Map<Element, Block>();
  private readonly byId = new Map<number, Block>();
  private readonly outbox = new Set<Block>();
  private nextId = 0;
  private accepting = false;
  private bands: Bands | null = null;
  private showMiddle = false;
  private rescan: ReturnType<typeof setTimeout> | undefined;
  private flush: ReturnType<typeof setTimeout> | undefined;

  private readonly viewport = new IntersectionObserver((entries) => this.onIntersect(entries), {
    rootMargin: '100% 0px', // one screen above and below: scored before the reader arrives
  });

  private readonly mutations = new MutationObserver((records) => {
    const own = records.every((record) => [...record.addedNodes, ...record.removedNodes].every(isBadge));
    if (own) return;
    clearTimeout(this.rescan);
    this.rescan = setTimeout(() => this.scan(), RESCAN_MS);
  });

  constructor(
    private readonly site: Site,
    private readonly link: Link,
  ) {}

  start(): void {
    this.mutations.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    this.scan();
  }

  /** Stops watching the page and takes the badges away. */
  stop(): void {
    this.mutations.disconnect();
    this.viewport.disconnect();
    clearTimeout(this.rescan);
    clearTimeout(this.flush);
    this.flush = undefined;
    for (const block of this.blocks.values()) block.badge?.remove();
    this.blocks.clear();
    this.byId.clear();
    this.outbox.clear();
  }

  /** Whether the host takes texts now. Turning it on sends what is near the viewport. */
  accept(on: boolean): void {
    this.accepting = on;
    if (!on) return;
    for (const block of this.blocks.values()) this.enqueue(block);
  }

  /**
   * The link to the host is gone, and the host has dropped what it had from this page:
   * the unanswered blocks go out again when a host accepts.
   */
  release(): void {
    for (const block of this.blocks.values()) if (waiting(block)) block.sent = false;
  }

  /** The thresholds and the display choice; every badge is drawn again. */
  display(bands: Bands, showMiddle: boolean): void {
    this.bands = bands;
    this.showMiddle = showMiddle;
    for (const block of this.blocks.values()) this.render(block);
  }

  results(results: Scored[]): void {
    for (const result of results) {
      const block = this.byId.get(result.id);
      if (!block || !block.sent) continue; // gone, or reset while the host was working
      block.result = result;
      this.render(block);
    }
  }

  private scan(): void {
    for (const block of [...this.blocks.values()]) if (!block.element.isConnected) this.drop(block);
    for (const kind of this.site.blocks) {
      for (const item of document.querySelectorAll(kind.item)) {
        const element = item.querySelector<HTMLElement>(kind.text);
        if (!element) continue;
        const anchor = () => (kind.anchor ? item.querySelector(kind.anchor) : null);
        const block = this.blocks.get(element);
        if (!block) this.track(element, anchor);
        else if (block.sent && lengthOf(element) !== block.length) this.reset(block);
        // The site may have drawn the item again, without the badge.
        else if (block.badge && !block.badge.isConnected) this.render(block);
      }
    }
  }

  private track(element: HTMLElement, anchor: Block['anchor']): void {
    const block: Block = {
      id: this.nextId++,
      element,
      anchor,
      badge: null,
      near: false,
      sent: false,
      length: 0,
      result: null,
    };
    this.blocks.set(element, block);
    this.byId.set(block.id, block);
    this.viewport.observe(element);
  }

  private drop(block: Block): void {
    this.viewport.unobserve(block.element);
    this.withdraw(block);
    this.blocks.delete(block.element);
    this.byId.delete(block.id);
  }

  /** The text changed: score it again. */
  private reset(block: Block): void {
    this.withdraw(block);
    block.result = null;
    this.render(block);
    this.enqueue(block);
  }

  /** Takes a block back from the outbox or from the host. */
  private withdraw(block: Block): void {
    this.outbox.delete(block);
    if (waiting(block)) this.link.cancel([block.id]);
    block.sent = false;
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const block = this.blocks.get(entry.target);
      if (!block) continue;
      block.near = entry.isIntersecting;
      if (block.near) this.enqueue(block);
      else if (!block.result) this.withdraw(block);
    }
  }

  private enqueue(block: Block): void {
    if (!this.accepting || !block.near || block.sent) return;
    this.outbox.add(block);
    this.flush ??= setTimeout(() => this.send(), SEND_MS);
  }

  private send(): void {
    this.flush = undefined;
    const items: Item[] = [];
    for (const block of this.outbox) {
      if (!block.element.isConnected) continue;
      // innerText, not textContent: the text as the reader sees it, with its line breaks.
      const text = block.element.innerText.trim();
      block.sent = true;
      block.length = lengthOf(block.element);
      if (text) items.push({ id: block.id, text });
    }
    this.outbox.clear();
    if (items.length) this.link.score(items);
  }

  private render(block: Block): void {
    const score = block.result?.score;
    const shown = score != null && this.bands ? verdict(score, this.bands, this.showMiddle) : null;
    if (!shown) {
      block.badge?.remove();
      block.badge = null;
      return;
    }
    block.badge ??= createBadge();
    paintBadge(block.badge, shown, `Slop Detect: score ${score!.toFixed(3)} of 1, ${block.result!.tokens} tokens`);
    if (!block.badge.isConnected) placeBadge(block.badge, block.anchor(), block.element);
  }
}

/** At the host, and not answered yet. */
const waiting = (block: Block) => block.sent && !block.result;

/** Cheap to read, unlike innerText, and the badge does not count: its text is in a shadow root. */
const lengthOf = (element: Element) => element.textContent?.length ?? 0;
