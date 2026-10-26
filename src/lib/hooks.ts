import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Level, Prompt } from '../data/types';
import { useStore, type CustomKey, type Player } from './store';
import { fill, type Filled } from './format';
import { getDeck } from './random';
import { sfx } from './sound';

/** Built-in prompts plus the user's own, filtered by the selected levels. */
export function usePrompts<T extends { l: Level }>(builtin: readonly T[], customKey?: CustomKey, extra?: (p: Prompt) => T): T[] {
  const { settings, custom } = useStore();
  return useMemo(() => {
    const own = customKey ? (custom[customKey] ?? []).map((p) => (extra ? extra(p) : (p as unknown as T))) : [];
    const all = [...builtin, ...own];
    const levels = settings.levels.length ? settings.levels : [1, 2, 3];
    const res = all.filter((x) => levels.includes(x.l));
    return res.length ? res : all;
  }, [builtin, custom, customKey, settings.levels, extra]);
}

/** Draw from a no-repeat deck. */
export function useDeck<T>(key: string, items: readonly T[]) {
  const deck = useMemo(() => getDeck(key, items), [key, items]);
  return useCallback(() => deck.draw(), [deck]);
}

export function useFill() {
  const { players, settings } = useStore();
  return useCallback(
    (text: string, current?: Player | null, fixed?: { p?: Player | null; p2?: Player | null; p3?: Player | null }): Filled =>
      fill(text, { players, current, drinkMode: settings.drinkMode, fixed }),
    [players, settings.drinkMode],
  );
}

/** Rotates through the player list. */
export function useTurn() {
  const { players } = useStore();
  const [idx, setIdx] = useState(0);
  const current = players.length ? players[idx % players.length] : null;
  const next = useCallback(() => setIdx((i) => (players.length ? (i + 1) % players.length : 0)), [players.length]);
  const random = useCallback(() => setIdx(players.length ? Math.floor(Math.random() * players.length) : 0), [players.length]);
  const set = useCallback((id: string) => setIdx(Math.max(0, players.findIndex((p) => p.id === id))), [players]);
  return { current, next, random, set, index: idx };
}

/** Countdown timer in seconds. Calls onEnd once when reaching 0. */
export function useCountdown(seconds: number, onEnd?: () => void, opts: { tick?: boolean } = {}) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const deadline = useRef(0);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const l = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft((prev) => {
        if (l !== prev && opts.tick && l > 0 && l <= 5) sfx.tick();
        return l;
      });
      if (l <= 0) {
        setRunning(false);
        endRef.current?.();
      }
    }, 100);
    return () => clearInterval(iv);
  }, [running, opts.tick]);

  const start = useCallback(
    (s = seconds) => {
      deadline.current = Date.now() + s * 1000;
      setLeft(s);
      setRunning(true);
    },
    [seconds],
  );
  const stop = useCallback(() => setRunning(false), []);
  const reset = useCallback(
    (s = seconds) => {
      setRunning(false);
      setLeft(s);
    },
    [seconds],
  );
  const addTime = useCallback((s: number) => {
    deadline.current += s * 1000;
  }, []);
  return { left, running, start, stop, reset, addTime, total: seconds };
}

/** Wake lock to keep the screen on while playing. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        /* denied */
      }
    };
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [active]);
}
