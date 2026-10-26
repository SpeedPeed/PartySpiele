export function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[rand(arr.length)];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export function between(min: number, max: number): number {
  return min + rand(max - min + 1);
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * Deck that hands out items without repetition until every item was drawn once,
 * then reshuffles. Decks are cached by key so leaving and re-entering a game
 * continues where it stopped.
 */
export class Deck<T> {
  private queue: T[] = [];
  constructor(private items: readonly T[]) {}

  setItems(items: readonly T[]) {
    if (items !== this.items) {
      this.items = items;
      this.queue = [];
    }
  }

  draw(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.queue.length === 0) this.queue = shuffle(this.items);
    return this.queue.pop();
  }

  get remaining() {
    return this.queue.length;
  }
}

const decks = new Map<string, { sig: string; deck: Deck<unknown> }>();

export function getDeck<T>(key: string, items: readonly T[]): Deck<T> {
  const sig = items.length + ':' + JSON.stringify(items[0] ?? '') + JSON.stringify(items[items.length - 1] ?? '');
  const cached = decks.get(key);
  if (cached && cached.sig === sig) return cached.deck as Deck<T>;
  const deck = new Deck(items);
  decks.set(key, { sig, deck: deck as Deck<unknown> });
  return deck;
}
