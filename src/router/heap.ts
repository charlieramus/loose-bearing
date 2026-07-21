// A tiny generic binary min-heap — the priority queue backing every search in the router.
// It carries no domain knowledge: callers pass a `less(a, b)` comparator that defines the
// ordering, and the router uses one whose ties resolve on node id so the whole search is
// deterministic (a hard V3 requirement). Pure structure, no randomness, no timestamps.

export class BinaryHeap<T> {
  private items: T[] = [];

  /** @param less strict ordering: `less(a, b)` is true iff `a` should pop before `b`. */
  constructor(private readonly less: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    const items = this.items;
    items.push(item);
    this.bubbleUp(items.length - 1);
  }

  /** Remove and return the smallest item, or undefined if empty. */
  pop(): T | undefined {
    const items = this.items;
    const n = items.length;
    if (n === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (n > 1) {
      items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    const items = this.items;
    const item = items[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(item, items[parent])) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = item;
  }

  private bubbleDown(i: number): void {
    const items = this.items;
    const n = items.length;
    const item = items[i];
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      let smallestItem = item;
      if (left < n && this.less(items[left], smallestItem)) {
        smallest = left;
        smallestItem = items[left];
      }
      if (right < n && this.less(items[right], smallestItem)) {
        smallest = right;
        smallestItem = items[right];
      }
      if (smallest === i) break;
      items[i] = items[smallest];
      i = smallest;
    }
    items[i] = item;
  }
}
