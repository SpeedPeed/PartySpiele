/**
 * Inhalts-Typen für Gaudi Games.
 *
 * Stufen (l):
 *   1 = Harmlos   (familien-/firmenfeiertauglich)
 *   2 = Party     (frech, leicht anzüglich)
 *   3 = Eskalation (peinlich, wild, viel trinken)
 *   4 = Spicy 18+ (sexuell/explizit, aber immer einvernehmlich & neutral formuliert)
 *
 * Platzhalter in Texten (werden zur Laufzeit ersetzt):
 *   {p}    aktueller Spieler
 *   {p2}   ein anderer zufälliger Spieler
 *   {p3}   noch ein anderer zufälliger Spieler (≠ {p}, ≠ {p2})
 *   {s:N}  "N Schlucke" bzw. "N Strafpunkte" (alkoholfreier Modus), N = 1..10
 *   {ex}   "ein ganzes Glas auf Ex" bzw. "10 Strafpunkte"
 */
export type Level = 1 | 2 | 3 | 4;

export interface Prompt {
  t: string;
  l: Level;
}

/** Entweder-Oder / Würdest du eher */
export interface Choice {
  a: string;
  b: string;
  l: Level;
}

/** Gaudi-Mix (Piccolo-artig) */
export type MixType =
  | 'aufgabe' // einfache Aufgabe / Ansage
  | 'regel' // neue Regel, gilt für einige Runden (wird später wieder aufgehoben)
  | 'virus' // wie Regel, aber Text beschreibt etwas, das ab jetzt passiert
  | 'gruppe' // Gruppenspiel: Kategorie, Abstimmung, Wettrennen ...
  | 'duell' // {p} gegen {p2}
  | 'frage'; // alle beantworten eine Frage / ich hab noch nie etc.

export interface MixCard {
  t: string;
  l: Level;
  type: MixType;
  /** Nur bei regel/virus: Text, der beim Aufheben angezeigt wird. */
  end?: string;
}

export interface TabuCard {
  w: string;
  f: [string, string, string, string, string];
}

export interface WordCategory {
  id: string;
  name: string;
  emoji: string;
  words: string[];
}

export interface ActivityWord {
  w: string;
  /** 1 leicht, 2 mittel, 3 schwer */
  d: 1 | 2 | 3;
}

export interface QuizQuestion {
  q: string;
  /** genau 4 Antworten */
  a: [string, string, string, string];
  /** Index der richtigen Antwort */
  c: 0 | 1 | 2 | 3;
  cat: string;
}

export interface EstimateQuestion {
  q: string;
  a: number;
  unit: string;
}

export interface UndercoverPair {
  a: string;
  b: string;
}

export interface SpyLocation {
  ort: string;
  emoji: string;
  rollen: string[];
}

/** Bluff (Fibbage-artig): Frage mit Lücke ___, die echte Antwort ist wahr. */
export interface BluffFact {
  q: string;
  a: string;
}
