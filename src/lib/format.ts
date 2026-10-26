import type { Level } from '../data/types';
import type { Player } from './store';
import { shuffle } from './random';

export const LEVELS: Record<Level, { name: string; emoji: string; color: string; desc: string }> = {
  1: { name: 'Harmlos', emoji: '😇', color: '#3dff6e', desc: 'Für Oma, Chef & Firmenfeier' },
  2: { name: 'Party', emoji: '🎉', color: '#19e3ff', desc: 'Frech, aber noch jugendfrei' },
  3: { name: 'Eskalation', emoji: '🔥', color: '#ff8a1f', desc: 'Peinlich, wild & ordentlich Schlucke' },
  4: { name: 'Spicy 18+', emoji: '🌶️', color: '#ff2e88', desc: 'Versaut – nur für Erwachsene' },
};

/** Markers used to highlight player names inside filled texts. */
export const NAME_START = '\u0001';
export const NAME_END = '\u0002';

export function sips(n: number, drinkMode: boolean): string {
  if (drinkMode) return n === 1 ? '1 Schluck' : `${n} Schlucke`;
  return n === 1 ? '1 Strafpunkt' : `${n} Strafpunkte`;
}

export function exText(drinkMode: boolean): string {
  return drinkMode ? 'ein ganzes Glas auf Ex' : '10 Strafpunkte';
}

export interface FillContext {
  players: Player[];
  current?: Player | null;
  drinkMode: boolean;
  /** Fixed names for {p2}/{p3} (e.g. so a rule's end text uses the same people). */
  fixed?: { p?: Player | null; p2?: Player | null; p3?: Player | null };
}

export interface Filled {
  text: string;
  p: Player | null;
  p2: Player | null;
  p3: Player | null;
}

const mark = (p: Player | null, fallback: string) => (p ? NAME_START + p.name + NAME_END : fallback);

/** Ersetzt {p} {p2} {p3} {s:N} {ex} in einem Text. */
export function fill(text: string, ctx: FillContext): Filled {
  const p = ctx.fixed?.p ?? ctx.current ?? null;
  const others = shuffle(ctx.players.filter((x) => x.id !== p?.id));
  const p2 = ctx.fixed?.p2 ?? others[0] ?? null;
  const p3 = ctx.fixed?.p3 ?? others.find((x) => x.id !== p2?.id) ?? null;
  const out = text
    .replace(/\{p3\}/g, mark(p3, 'jemand anderes'))
    .replace(/\{p2\}/g, mark(p2, 'jemand'))
    .replace(/\{p\}/g, mark(p, 'du'))
    .replace(/\{s:(\d+)\}/g, (_, n) => sips(Number(n), ctx.drinkMode))
    .replace(/\{ex\}/g, exText(ctx.drinkMode));
  return { text: out, p, p2, p3 };
}

export function plain(text: string): string {
  return text.split(NAME_START).join('').split(NAME_END).join('');
}

/** Upper-cases the first visible character (names may start with a marker). */
export function capFirst(text: string): string {
  const i = text[0] === NAME_START ? 1 : 0;
  return text.slice(0, i) + text.charAt(i).toUpperCase() + text.slice(i + 1);
}
