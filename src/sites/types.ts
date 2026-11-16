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
}

/** One kind of user-written text on a site. */
export interface BlockKind {
  name: string;
  /** Selects each post or comment. */
  item: string;
  /**
   * Selects the element with the text inside an item; `:scope` is the item, and the first
   * match in document order is taken. It must be an element that draws its own children,
   * since the badge goes inside it, and it must not be the text of a nested item.
   */
  text: string;
}
