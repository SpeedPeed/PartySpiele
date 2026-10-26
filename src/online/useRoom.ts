import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Level } from '../data/types';
import { uid } from '../lib/random';
import { getSupabase } from './supabase';
import { ONLINE_GAMES } from './games';
import type { Member, OnlineCtx, Stream } from './types';

export interface Identity {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface RoomState {
  epoch: string;
  seq: number;
  gameId: string | null;
  game: unknown;
  drinkMode: boolean;
  levels: Level[];
}

export type RoomStatus = 'connecting' | 'connected' | 'error';

const ID_KEY = 'gaudi-identity';

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(ID_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(i: Identity) {
  try {
    localStorage.setItem(ID_KEY, JSON.stringify(i));
  } catch {
    /* ignore */
  }
}

export function newRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
  return c;
}

const hostKey = (code: string) => `gaudi-host-${code}`;

function loadHostState(code: string, drinkMode: boolean, levels: Level[]): RoomState {
  try {
    const raw = sessionStorage.getItem(hostKey(code));
    if (raw) return { ...(JSON.parse(raw) as RoomState), drinkMode, levels };
  } catch {
    /* ignore */
  }
  return { epoch: uid(), seq: 0, gameId: null, game: null, drinkMode, levels };
}

interface Options {
  code: string;
  me: Identity;
  isHost: boolean;
  url: string;
  anonKey: string;
  drinkMode: boolean;
  levels: Level[];
}

export function useRoom({ code, me, isHost, url, anonKey, drinkMode, levels }: Options) {
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [room, setRoom] = useState<RoomState>(() =>
    isHost ? loadHostState(code, drinkMode, levels) : { epoch: '', seq: -1, gameId: null, game: null, drinkMode, levels },
  );
  const roomRef = useRef(room);
  const membersRef = useRef(members);
  membersRef.current = members;
  const chanRef = useRef<RealtimeChannel | null>(null);
  const listeners = useRef(new Map<string, Set<(p: unknown) => void>>());
  const joinedAt = useRef(Date.now());

  const broadcast = useCallback((event: string, payload: unknown) => {
    void chanRef.current?.send({ type: 'broadcast', event, payload });
  }, []);

  /** Host: commit a new room state and broadcast it. */
  const commit = useCallback(
    (next: Omit<RoomState, 'seq' | 'epoch'>) => {
      const cur = roomRef.current;
      const r: RoomState = { ...next, epoch: cur.epoch, seq: cur.seq + 1 };
      roomRef.current = r;
      setRoom(r);
      try {
        sessionStorage.setItem(hostKey(code), JSON.stringify(r));
      } catch {
        /* ignore */
      }
      broadcast('state', r);
    },
    [broadcast, code],
  );

  const ctx = useCallback(
    (): OnlineCtx => ({ players: membersRef.current, now: Date.now(), levels: roomRef.current.levels, drinkMode: roomRef.current.drinkMode }),
    [],
  );

  /** Host: run an action through the game's reducer. */
  const hostDispatch = useCallback(
    (action: { type: string; from: string }) => {
      const cur = roomRef.current;
      if (!cur.gameId) return;
      const def = ONLINE_GAMES.find((g) => g.id === cur.gameId);
      if (!def) return;
      let next: unknown;
      try {
        next = def.reduce(cur.game, action, ctx());
      } catch (e) {
        console.error('reduce failed', e);
        return;
      }
      if (next !== cur.game) commit({ ...cur, game: next });
    },
    [commit, ctx],
  );

  // keep host settings in sync
  useEffect(() => {
    if (!isHost) return;
    const cur = roomRef.current;
    if (cur.drinkMode !== drinkMode || cur.levels.join() !== levels.join()) commit({ ...cur, drinkMode, levels });
  }, [isHost, drinkMode, levels, commit]);

  useEffect(() => {
    let client;
    try {
      client = getSupabase(url, anonKey);
    } catch (e) {
      setStatus('error');
      setError(String(e));
      return;
    }
    const channel = client.channel(`gaudi-room-${code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: me.id } },
    });
    chanRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const st = channel.presenceState<Member>();
      const list: Member[] = [];
      for (const k of Object.keys(st)) {
        const m = st[k][0];
        if (m) list.push({ id: m.id, name: m.name, avatar: m.avatar, color: m.color, host: m.host, joinedAt: m.joinedAt });
      }
      list.sort((a, b) => (a.host === b.host ? a.joinedAt - b.joinedAt : a.host ? -1 : 1));
      setMembers(list);
    });

    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (isHost) return;
      const r = payload as RoomState;
      const cur = roomRef.current;
      if (r.epoch !== cur.epoch || r.seq > cur.seq) {
        roomRef.current = r;
        setRoom(r);
      }
    });

    channel.on('broadcast', { event: 'action' }, ({ payload }) => {
      if (!isHost) return;
      hostDispatch(payload as { type: string; from: string });
    });

    channel.on('broadcast', { event: 'hello' }, () => {
      if (isHost) broadcast('state', roomRef.current);
    });

    channel.on('broadcast', { event: 'stream' }, ({ payload }) => {
      const { ev, data } = payload as { ev: string; data: unknown };
      listeners.current.get(ev)?.forEach((cb) => cb(data));
    });

    channel.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('connected');
        await channel.track({ ...me, host: isHost, joinedAt: joinedAt.current } satisfies Member);
        if (isHost) broadcast('state', roomRef.current);
        else broadcast('hello', { from: me.id });
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        setStatus('error');
        setError(s === 'TIMED_OUT' ? 'Zeitüberschreitung beim Verbinden.' : 'Verbindung zum Server fehlgeschlagen.');
      }
    });

    return () => {
      chanRef.current = null;
      void channel.untrack();
      void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, me.id, isHost, url, anonKey]);

  // Clients ask again for the state until they get one (in case the hello got lost).
  useEffect(() => {
    if (isHost || status !== 'connected' || room.seq >= 0) return;
    const iv = setInterval(() => broadcast('hello', { from: me.id }), 2000);
    return () => clearInterval(iv);
  }, [isHost, status, room.seq, broadcast, me.id]);

  // Host ticks once per second so games can run timers.
  useEffect(() => {
    if (!isHost || !room.gameId) return;
    const iv = setInterval(() => hostDispatch({ type: 'tick', from: me.id }), 1000);
    return () => clearInterval(iv);
  }, [isHost, room.gameId, hostDispatch, me.id]);

  const send = useCallback(
    (a: { type: string }) => {
      const action = { ...a, from: me.id };
      if (isHost) hostDispatch(action);
      else broadcast('action', action);
    },
    [isHost, hostDispatch, broadcast, me.id],
  );

  const startGame = useCallback(
    (gameId: string) => {
      if (!isHost) return;
      const def = ONLINE_GAMES.find((g) => g.id === gameId);
      if (!def) return;
      const cur = roomRef.current;
      commit({ ...cur, gameId, game: def.init(ctx()) });
    },
    [isHost, commit, ctx],
  );

  const endGame = useCallback(() => {
    if (!isHost) return;
    commit({ ...roomRef.current, gameId: null, game: null });
  }, [isHost, commit]);

  const stream = useMemo<Stream>(
    () => ({
      send(ev, data) {
        broadcast('stream', { ev, data });
      },
      on(ev, cb) {
        let set = listeners.current.get(ev);
        if (!set) listeners.current.set(ev, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
    }),
    [broadcast],
  );

  const hostPresent = members.some((m) => m.host);

  return { status, error, members, room, send, startGame, endGame, stream, hostPresent };
}
