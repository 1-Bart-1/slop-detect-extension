/** The scores of the texts seen lately: a page re-renders its comments and tabs repeat them. */
export class ScoreCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly size: number) {}

  get(text: string): V | undefined {
    const value = this.entries.get(text);
    if (value === undefined) return undefined;
    // A Map keeps insertion order: moving a hit to the end leaves the least used in front.
    this.entries.delete(text);
    this.entries.set(text, value);
    return value;
  }

  set(text: string, value: V): void {
    this.entries.delete(text);
    this.entries.set(text, value);
    if (this.entries.size > this.size) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
  }
}
