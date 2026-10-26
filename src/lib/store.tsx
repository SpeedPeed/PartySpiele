import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Level, Prompt } from '../data/types';
import { uid } from './random';
import { setSoundEnabled, setVibrationEnabled } from './sound';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  /** Spielt alkoholfrei – Schlucke werden für diese Person als Strafpunkte gezählt. */
  noAlcohol: boolean;
}

export interface Settings {
  drinkMode: boolean;
  levels: Level[];
  sound: boolean;
  vibration: boolean;
  scanlines: boolean;
  supabaseUrl: string;
  supabaseKey: string;
}

export interface PlayerStats {
  sips: number;
  points: number;
  done: number;
  refused: number;
  wins: number;
}

export type StatKey = keyof PlayerStats;

/** Eigene Inhalte – Schlüssel entsprechen den Spiel-Kategorien. */
export type CustomKey =
  | 'wahrheit'
  | 'pflicht'
  | 'ichHabNochNie'
  | 'werWuerdeEher'
  | 'paranoia'
  | 'gaudiMix'
  | 'regeln'
  | 'kategorien'
  | 'heisserStuhl'
  | 'gluecksrad';

export const CUSTOM_LABELS: Record<CustomKey, string> = {
  wahrheit: 'Wahrheit',
  pflicht: 'Pflicht',
  ichHabNochNie: 'Ich hab noch nie',
  werWuerdeEher: 'Wer würde eher',
  paranoia: 'Paranoia',
  gaudiMix: 'Gaudi-Mix Karten',
  regeln: 'Hausregeln',
  kategorien: 'Wortbombe-Kategorien',
  heisserStuhl: 'Heißer Stuhl',
  gluecksrad: 'Glücksrad-Felder',
};

export const AVATARS = ['🍺', '🍷', '🥨', '🦄', '👽', '🤖', '👾', '🐸', '🦊', '🐷', '🐻', '🐼', '🐙', '🦖', '🎃', '💀', '🤠', '🥸', '😎', '🤡', '👑', '🌶️', '🍕', '🌭', '🍔', '🥒', '🍆', '🍑', '🧀', '⛷️', '🏔️', '🎸', '🎺', '🪩', '🔥', '⚡', '🌈', '🐮', '🦔', '🐧'];
export const COLORS = ['#ff2e88', '#19e3ff', '#ffe03a', '#3dff6e', '#ff8a1f', '#a64dff', '#ff5f5f', '#5fa8ff', '#f0f', '#7fffd4', '#ffb3d9', '#c0ff3e'];

const DEFAULT_SETTINGS: Settings = {
  drinkMode: true,
  levels: [1, 2, 3],
  sound: true,
  vibration: true,
  scanlines: true,
  supabaseUrl: '',
  supabaseKey: '',
};

const EMPTY_STATS: PlayerStats = { sips: 0, points: 0, done: 0, refused: 0, wins: 0 };

interface Persisted {
  players: Player[];
  settings: Settings;
  stats: Record<string, PlayerStats>;
  custom: Partial<Record<CustomKey, Prompt[]>>;
}

const KEY = 'gaudi-games-v1';

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return {
        players: p.players ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        stats: p.stats ?? {},
        custom: p.custom ?? {},
      };
    }
  } catch {
    /* ignore broken storage */
  }
  return { players: [], settings: DEFAULT_SETTINGS, stats: {}, custom: {} };
}

interface Store extends Persisted {
  addPlayer(name: string): void;
  updatePlayer(id: string, patch: Partial<Player>): void;
  removePlayer(id: string): void;
  movePlayer(id: string, dir: -1 | 1): void;
  setSettings(patch: Partial<Settings>): void;
  addStat(playerId: string, key: StatKey, n?: number): void;
  resetStats(): void;
  addCustom(key: CustomKey, p: Prompt): void;
  removeCustom(key: CustomKey, index: number): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked */
    }
  }, [data]);

  useEffect(() => {
    setSoundEnabled(data.settings.sound);
    setVibrationEnabled(data.settings.vibration);
    document.body.classList.toggle('no-scanlines', !data.settings.scanlines);
  }, [data.settings.sound, data.settings.vibration, data.settings.scanlines]);

  const addPlayer = useCallback((name: string) => {
    setData((d) => {
      const used = new Set(d.players.map((p) => p.avatar));
      const avatar = AVATARS.find((a) => !used.has(a)) ?? AVATARS[d.players.length % AVATARS.length];
      const color = COLORS[d.players.length % COLORS.length];
      return { ...d, players: [...d.players, { id: uid(), name: name.trim(), avatar, color, noAlcohol: false }] };
    });
  }, []);

  const updatePlayer = useCallback((id: string, patch: Partial<Player>) => {
    setData((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, []);

  const removePlayer = useCallback((id: string) => {
    setData((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) }));
  }, []);

  const movePlayer = useCallback((id: string, dir: -1 | 1) => {
    setData((d) => {
      const i = d.players.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.players.length) return d;
      const players = d.players.slice();
      [players[i], players[j]] = [players[j], players[i]];
      return { ...d, players };
    });
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const addStat = useCallback((playerId: string, key: StatKey, n = 1) => {
    setData((d) => {
      const cur = d.stats[playerId] ?? EMPTY_STATS;
      return { ...d, stats: { ...d.stats, [playerId]: { ...cur, [key]: cur[key] + n } } };
    });
  }, []);

  const resetStats = useCallback(() => setData((d) => ({ ...d, stats: {} })), []);

  const addCustom = useCallback((key: CustomKey, p: Prompt) => {
    setData((d) => ({ ...d, custom: { ...d.custom, [key]: [...(d.custom[key] ?? []), p] } }));
  }, []);

  const removeCustom = useCallback((key: CustomKey, index: number) => {
    setData((d) => ({ ...d, custom: { ...d.custom, [key]: (d.custom[key] ?? []).filter((_, i) => i !== index) } }));
  }, []);

  const value = useMemo<Store>(
    () => ({ ...data, addPlayer, updatePlayer, removePlayer, movePlayer, setSettings, addStat, resetStats, addCustom, removeCustom }),
    [data, addPlayer, updatePlayer, removePlayer, movePlayer, setSettings, addStat, resetStats, addCustom, removeCustom],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export function statsOf(stats: Record<string, PlayerStats>, id: string): PlayerStats {
  return stats[id] ?? EMPTY_STATS;
}
