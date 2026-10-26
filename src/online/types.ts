import type { ComponentType } from 'react';
import type { Level } from '../data/types';

export interface Member {
  id: string;
  name: string;
  avatar: string;
  color: string;
  host: boolean;
  joinedAt: number;
}

/** Context available to the host when creating / reducing game state. */
export interface OnlineCtx {
  players: Member[];
  now: number;
  levels: Level[];
  drinkMode: boolean;
}

/** Every action carries the sender id. The host also dispatches { type: 'tick' } every second. */
export type WithFrom<A> = A & { from: string };
export type TickAction = { type: 'tick' };

export interface Stream {
  send(event: string, payload: unknown): void;
  /** Returns an unsubscribe function. */
  on(event: string, cb: (payload: unknown) => void): () => void;
}

export interface OnlineViewProps<S, A> {
  state: S;
  me: Member;
  isHost: boolean;
  players: Member[];
  send: (a: A) => void;
  /** Replaces {s:N} {ex} {p} etc. using the host's drink setting. */
  fill: (text: string, names?: { p?: string; p2?: string; p3?: string }) => string;
  /** Host only: back to the lobby. */
  endGame: () => void;
  stream: Stream;
  drinkMode: boolean;
}

export interface OnlineGameDef<S = any, A = any> {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  color: string;
  minPlayers: number;
  rules: string[];
  levels?: boolean;
  init(ctx: OnlineCtx): S;
  /** Pure-ish reducer run ONLY on the host. May use Math.random. Return the same object to skip broadcasting. */
  reduce(state: S, action: WithFrom<A> | WithFrom<TickAction>, ctx: OnlineCtx): S;
  View: ComponentType<OnlineViewProps<S, A>>;
}
