/** A site the extension reads, as data: adding a site is adding one of these to `index.ts`. */
export interface Site {
  /** The key of the site in the settings. */
  name: string;
  /** As the popup shows it. */
  label: string;
  /** Match patterns of the content script: the pages of the site it runs on. */
  matches: string[];
  /** The host names the patterns cover: the site of a page is found by its host's suffix. */
  hosts: string[];
  blocks: BlockKind[];
  /** Selects elements inside a text that are not part of it: a button that expands it. */
  skip?: string;
  /** Takes out of a text's markdown what the training texts of the site did not have. */
  tidy?(markdown: string): string;
}

/**
 * One kind of user-written text on a site. In `text` and `anchor`, `:scope` is the item
 * and the first match in document order is taken, so neither may match inside a nested
 * item that comes before the item's own.
 */
export interface BlockKind {
  name: string;
  /** Selects each post or comment. */
  item: string;
  /** Selects the element with the text inside an item. It is scored as markdown. */
  text: string;
  /**
   * Selects the element on the item's metadata line that the badge follows, usually the
   * time. Where it matches nothing the badge goes to the top of the text.
   */
  anchor?: string;
}
