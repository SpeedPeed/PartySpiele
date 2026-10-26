import { useEffect, useState, type CSSProperties } from 'react';
import { Button, Confetti, Panel, Seg, Toggle } from '../../components/ui';
import { between, pick, shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, MemberChip, Scoreboard, VoteGrid, WaitingFor } from '../kit';
import type { Member, OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';

export type Role = 'wolf' | 'seer' | 'witch' | 'hunter' | 'amor' | 'villager';
type Step = 'amor' | 'wolves' | 'seer' | 'witch';
type Phase = 'setup' | 'roles' | 'night' | 'dawn' | 'discuss' | 'vote' | 'verdict' | 'end';
type Cause = 'wolves' | 'poison' | 'lynch' | 'love' | 'hunter' | 'left';
type Winner = 'village' | 'wolves' | 'lovers';
interface Info {
  name: string;
  avatar: string;
  color: string;
}
interface Death {
  id: string;
  cause: Cause;
}
interface Opts {
  wolves: number;
  seer: boolean;
  witch: boolean;
  hunter: boolean;
  amor: boolean;
  discuss: number;
}

export interface S {
  phase: Phase;
  opts: Opts;
  game: number;
  roles: Record<string, Role>;
  info: Record<string, Info>;
  alive: string[];
  confirmed: string[];
  lovers: string[] | null;
  potions: { heal: boolean; poison: boolean };
  night: number;
  steps: Step[];
  stepIdx: number;
  stepMinEnd: number;
  stepDeadline: number;
  tapped: string[];
  wolfVotes: Record<string, string>;
  victim: string | null;
  seerPick: string | null;
  seerLog: { night: number; target: string; evil: boolean }[];
  witchHeal: boolean;
  witchPoison: string | null;
  amorPicks: string[];
  deaths: Death[];
  hunter: { id: string; deadline: number } | null;
  hunterQueue: string[];
  discussDeadline: number;
  votes: Record<string, string>;
  voteDeadline: number;
  lynched: string | null;
  tally: Record<string, number>;
  winner: Winner | null;
  scores: Record<string, number>;
  goneSince: Record<string, number>;
}

export type A =
  | { type: 'opts'; opts: Partial<Opts> }
  | { type: 'start' }
  | { type: 'ok' }
  | { type: 'tap'; target: string }
  | { type: 'amor'; a: string; b: string }
  | { type: 'wolfVote'; target: string }
  | { type: 'seer'; target: string }
  | { type: 'witch'; heal: boolean; poison: string | null }
  | { type: 'shoot'; target: string | null }
  | { type: 'next' }
  | { type: 'vote'; target: string }
  | { type: 'again' };

export const NIGHT_SECS = 45;
const HUNTER_SECS = 45;
const VOTE_SECS = 90;
const LEAVE_MS = 60000;

export const ROLE_INFO: Record<Role, { name: string; emoji: string; desc: string; evil?: boolean }> = {
  wolf: {
    name: 'Werwolf',
    emoji: '🐺',
    evil: true,
    desc: 'Jede Nacht sucht ihr Wölfe euch gemeinsam ein Opfer aus. Untertags spielst du den harmlosen Dorftrottel. Ihr gewinnt, wenn ihr gleich viele seid wie der Rest.',
  },
  seer: { name: 'Seherin', emoji: '🔮', desc: 'Jede Nacht darfst du einer Person in die Seele schauen: Gut oder Böse? Verrat dich nicht zu früh!' },
  witch: { name: 'Hexe', emoji: '🧪', desc: 'Du siehst, wen die Wölfe erwischt haben. Einmal im Spiel darfst du heilen, einmal vergiften.' },
  hunter: { name: 'Jäger', emoji: '🏹', desc: 'Stirbst du, nimmst du sofort jemanden mit ins Grab. Zielen nicht vergessen!' },
  amor: { name: 'Amor', emoji: '💘', desc: 'In der ersten Nacht verliebst du zwei Personen. Stirbt einer, stirbt der andere aus Liebeskummer.' },
  villager: { name: 'Dorfbewohner', emoji: '🧑‍🌾', desc: 'Keine Spezialkraft, aber eine Stimme und einen Riecher. Finde die Wölfe, bevor sie dich finden!' },
};

const STEP_TEXT: Record<Step, string[]> = {
  amor: ['💘 Amor torkelt aus dem Wirtshaus, spannt den Bogen und schießt – hoffentlich triffts die Richtigen …', '💘 Amor hat zu viel Most erwischt und verteilt Liebespfeile …'],
  wolves: [
    '🐺 Die Werwölfe erwachen und haben an ordentlichen Gusto auf Dorfbewohner …',
    '🐺 Aus dem Wald hört man Heulen. Die Wölfe suchen sich ihre Jause aus …',
    '🐺 Die Wölfe schleichen durchs Dorf und schnuppern an jeder Tür …',
  ],
  seer: ['🔮 Die Seherin schaut in ihre Glaskugel (oder ins Stamperl) …', '🔮 Die Seherin legt die Karten – und sieht vielleicht mehr, als ihr lieb is …'],
  witch: ['🧪 Die Hexe rührt im Kessel und überlegt, wem sie heute was Gutes tut – oder was Schlechtes …', '🧪 Die Hexe kramt in ihrem Kastl nach Heiltrank und Gift …'],
};
const NIGHT_INTRO = [
  '🌙 Das Dorf Gaudingen schläft ein … Augen zu, Handy flach – nur der Wirt schaut noch.',
  '🌙 Die Nacht senkt sich über Gaudingen. Irgendwo bellt ein Hund, irgendwo schnarcht der Bürgermeister …',
  '🌙 Gaudingen geht schlafen. Die Kirchturmuhr schlägt zwölf. Nix Gutes passiert nach Mitternacht …',
];
const DAWN_TEXT = [
  '☀️ Der Hahn kräht, Gaudingen wacht verkatert auf …',
  '☀️ Die Sonne geht auf über Gaudingen. Die Bäckerei hat offen – aber nicht jeder holt sich heut a Semmel …',
  '☀️ Guten Morgen, Gaudingen! Der Kaffee is heiß, die Stimmung eher nicht …',
];
const CAUSE_TEXT: Record<Cause, string> = {
  wolves: 'von den Wölfen zerfetzt 🐺',
  poison: 'vergiftet 🧪',
  lynch: 'vom Dorf gelyncht 🪢',
  love: 'aus Liebeskummer gestorben 💔',
  hunter: 'vom Jäger erschossen 🏹',
  left: 'hat das Dorf verlassen 🚪',
};

const hostId = (ctx: OnlineCtx) => ctx.players.find((p) => p.host)?.id;
const presentIds = (ctx: OnlineCtx) => new Set(ctx.players.map((p) => p.id));

export function suggestWolves(n: number) {
  return n <= 6 ? 1 : n <= 10 ? 2 : 3;
}
function maxWolves(n: number) {
  return Math.max(1, Math.floor((n - 1) / 2));
}

export function assignRoles(ids: string[], o: Opts): Record<string, Role> {
  const shuffled = shuffle(ids);
  const n = ids.length;
  const wolves = Math.max(1, Math.min(o.wolves, maxWolves(n)));
  const specials: Role[] = [];
  if (o.seer) specials.push('seer');
  if (o.witch) specials.push('witch');
  if (o.hunter) specials.push('hunter');
  if (o.amor) specials.push('amor');
  // keep at least one plain person besides wolves when possible
  const room = Math.max(0, n - wolves);
  const sp = specials.slice(0, room);
  const roles: Record<string, Role> = {};
  shuffled.forEach((id, i) => {
    roles[id] = i < wolves ? 'wolf' : i - wolves < sp.length ? sp[i - wolves] : 'villager';
  });
  return roles;
}

const hasRole = (s: S, r: Role) => Object.values(s.roles).includes(r);
const aliveWith = (s: S, r: Role) => s.alive.filter((id) => s.roles[id] === r);

export function checkWin(s: S): Winner | null {
  const w = aliveWith(s, 'wolf').length;
  const others = s.alive.length - w;
  if (w === 0) return 'village';
  if (s.lovers && s.alive.length === 2 && s.lovers.every((id) => s.alive.includes(id))) return 'lovers';
  if (w >= others) return 'wolves';
  return null;
}

export function isWinner(s: S, id: string, w: Winner): boolean {
  if (w === 'lovers') return !!s.lovers?.includes(id);
  if (w === 'wolves') return s.roles[id] === 'wolf';
  return s.roles[id] !== 'wolf';
}

function finish(s: S, w: Winner): S {
  const scores = { ...s.scores };
  for (const id of Object.keys(s.roles)) if (isWinner(s, id, w)) scores[id] = (scores[id] ?? 0) + (s.alive.includes(id) ? 2 : 1);
  return { ...s, phase: 'end', winner: w, hunter: null, hunterQueue: [], scores };
}

/** Kills people incl. lovers' heartbreak; queues dead hunters. */
function kill(s: S, initial: Death[]): S {
  let alive = s.alive.slice();
  const deaths: Death[] = [];
  const queue = [...initial];
  while (queue.length) {
    const d = queue.shift()!;
    if (!alive.includes(d.id)) continue;
    alive = alive.filter((x) => x !== d.id);
    deaths.push(d);
    if (s.lovers?.includes(d.id)) {
      const other = s.lovers.find((x) => x !== d.id);
      if (other && alive.includes(other)) queue.push({ id: other, cause: 'love' });
    }
  }
  const hunters = deaths.filter((d) => s.roles[d.id] === 'hunter' && d.cause !== 'left').map((d) => d.id);
  const votes = { ...s.votes };
  for (const v of Object.keys(votes)) if (!alive.includes(v) || !alive.includes(votes[v])) delete votes[v];
  return { ...s, alive, votes, deaths: [...s.deaths, ...deaths], hunterQueue: [...s.hunterQueue, ...hunters] };
}

function startHunter(s: S, ctx: OnlineCtx): S {
  if (s.hunter || !s.hunterQueue.length) return s;
  const [id, ...rest] = s.hunterQueue;
  return { ...s, hunter: { id, deadline: ctx.now + HUNTER_SECS * 1000 }, hunterQueue: rest };
}

function beginStep(s: S, idx: number, ctx: OnlineCtx): S {
  return {
    ...s,
    stepIdx: idx,
    stepMinEnd: ctx.now + between(6, 12) * 1000,
    stepDeadline: ctx.now + NIGHT_SECS * 1000,
    tapped: [],
    wolfVotes: {},
    seerPick: null,
    witchHeal: false,
    witchPoison: null,
    amorPicks: [],
  };
}

function startNight(s: S, ctx: OnlineCtx): S {
  const night = s.night + 1;
  const steps: Step[] = [];
  if (night === 1 && hasRole(s, 'amor')) steps.push('amor');
  steps.push('wolves');
  if (hasRole(s, 'seer')) steps.push('seer');
  if (hasRole(s, 'witch')) steps.push('witch');
  return beginStep({ ...s, phase: 'night', night, steps, victim: null, deaths: [], hunter: null, hunterQueue: [], lynched: null, tally: {}, votes: {} }, 0, ctx);
}

/** Who still has to tap in the current night step. */
function nightPending(s: S, ctx: OnlineCtx): string[] {
  const pres = presentIds(ctx);
  return s.alive.filter((id) => pres.has(id) && !s.tapped.includes(id));
}

function endStep(s: S, ctx: OnlineCtx): S {
  const step = s.steps[s.stepIdx];
  let n = s;
  if (step === 'amor') {
    let picks = s.amorPicks;
    if (picks.length !== 2) picks = shuffle(s.alive).slice(0, 2);
    n = { ...n, lovers: picks.length === 2 ? picks : null };
  } else if (step === 'wolves') {
    const wolves = aliveWith(s, 'wolf');
    const prey = s.alive.filter((id) => s.roles[id] !== 'wolf');
    const tally: Record<string, number> = {};
    for (const w of wolves) {
      const t = s.wolfVotes[w];
      if (t && prey.includes(t)) tally[t] = (tally[t] ?? 0) + 1;
    }
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((id) => tally[id] === max);
    const victim = top.length ? pick(top) : wolves.length && prey.length ? pick(prey) : null;
    n = { ...n, victim };
  } else if (step === 'witch') {
    const witchAlive = aliveWith(s, 'witch').length > 0;
    let potions = s.potions;
    let victim = s.victim;
    let poisoned: string | null = null;
    if (witchAlive && s.witchHeal && potions.heal && victim) {
      victim = null;
      potions = { ...potions, heal: false };
    }
    if (witchAlive && s.witchPoison && potions.poison && s.alive.includes(s.witchPoison)) {
      poisoned = s.witchPoison;
      potions = { ...potions, poison: false };
    }
    n = { ...n, potions, victim, witchPoison: poisoned };
  }
  if (s.stepIdx + 1 < s.steps.length) return beginStep(n, s.stepIdx + 1, ctx);
  return dawn(n, ctx);
}

function dawn(s: S, ctx: OnlineCtx): S {
  const list: Death[] = [];
  if (s.victim) list.push({ id: s.victim, cause: 'wolves' });
  const poison = s.steps.includes('witch') ? s.witchPoison : null;
  if (poison && poison !== s.victim) list.push({ id: poison, cause: 'poison' });
  else if (poison && poison === s.victim) list[0] = { id: poison, cause: 'poison' };
  const n = kill({ ...s, phase: 'dawn' }, list);
  return startHunter(n, ctx);
}

function resolveVote(s: S, ctx: OnlineCtx, force: boolean): S {
  const pres = presentIds(ctx);
  const voters = s.alive.filter((id) => pres.has(id));
  if (!force && (!voters.length || !voters.every((id) => s.votes[id]))) return s;
  const tally: Record<string, number> = {};
  for (const v of s.alive) {
    const t = s.votes[v];
    if (t && s.alive.includes(t)) tally[t] = (tally[t] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  const base: S = { ...s, phase: 'verdict', tally, lynched: null };
  if (top.length !== 1) return base;
  return startHunter(kill({ ...base, lynched: top[0] }, [{ id: top[0], cause: 'lynch' }]), ctx);
}

function handleLeavers(s: S, ctx: OnlineCtx): S {
  const pres = presentIds(ctx);
  let goneSince = s.goneSince;
  let changed = false;
  const kick: Death[] = [];
  for (const id of s.alive) {
    if (pres.has(id)) {
      if (goneSince[id]) {
        goneSince = { ...goneSince };
        delete goneSince[id];
        changed = true;
      }
    } else if (!goneSince[id]) {
      goneSince = { ...goneSince, [id]: ctx.now };
      changed = true;
    } else if (ctx.now - goneSince[id] > LEAVE_MS) kick.push({ id, cause: 'left' });
  }
  if (!changed && !kick.length) return s;
  let n: S = { ...s, goneSince };
  if (kick.length) {
    n = kill(n, kick);
    if (n.phase === 'night' || n.phase === 'discuss' || n.phase === 'vote') {
      const w = checkWin(n);
      if (w) return finish(n, w);
    }
  }
  return n;
}

function reduce(s: S, a: (A | { type: 'tick' }) & { from: string }, ctx: OnlineCtx): S {
  const fromHost = a.from === hostId(ctx);
  const alive = s.alive.includes(a.from);
  const step = s.phase === 'night' ? s.steps[s.stepIdx] : null;
  const myRole = s.roles[a.from];
  const tap = (n: S): S => (n.tapped.includes(a.from) ? n : { ...n, tapped: [...n.tapped, a.from] });

  switch (a.type) {
    case 'opts': {
      if (s.phase !== 'setup' || !fromHost) return s;
      const o = { ...s.opts, ...a.opts };
      o.wolves = Math.max(1, Math.min(3, Math.round(o.wolves) || 1));
      if (![60, 120, 180, 300].includes(o.discuss)) o.discuss = 120;
      return { ...s, opts: o };
    }
    case 'start': {
      if (s.phase !== 'setup' || !fromHost || ctx.players.length < 5) return s;
      const ids = ctx.players.map((p) => p.id);
      const info: Record<string, Info> = {};
      for (const p of ctx.players) info[p.id] = { name: p.name, avatar: p.avatar, color: p.color };
      return {
        ...s,
        phase: 'roles',
        roles: assignRoles(ids, s.opts),
        info,
        alive: ids,
        confirmed: [],
        lovers: null,
        potions: { heal: true, poison: true },
        night: 0,
        steps: [],
        stepIdx: 0,
        seerLog: [],
        deaths: [],
        hunter: null,
        hunterQueue: [],
        votes: {},
        lynched: null,
        tally: {},
        winner: null,
        goneSince: {},
      };
    }
    case 'ok': {
      if (s.phase !== 'roles' || !alive || s.confirmed.includes(a.from)) return s;
      return checkRolesDone({ ...s, confirmed: [...s.confirmed, a.from] }, ctx);
    }
    case 'tap':
      if (!step || !alive) return s;
      return tap(s);
    case 'amor':
      if (step !== 'amor' || !alive || myRole !== 'amor' || a.a === a.b || !s.alive.includes(a.a) || !s.alive.includes(a.b)) return s;
      return tap({ ...s, amorPicks: [a.a, a.b] });
    case 'wolfVote':
      if (step !== 'wolves' || !alive || myRole !== 'wolf' || !s.alive.includes(a.target) || s.roles[a.target] === 'wolf') return s;
      return tap({ ...s, wolfVotes: { ...s.wolfVotes, [a.from]: a.target } });
    case 'seer':
      if (step !== 'seer' || !alive || myRole !== 'seer' || s.seerPick || !s.alive.includes(a.target) || a.target === a.from) return s;
      return tap({ ...s, seerPick: a.target, seerLog: [...s.seerLog, { night: s.night, target: a.target, evil: s.roles[a.target] === 'wolf' }] });
    case 'witch': {
      if (step !== 'witch' || !alive || myRole !== 'witch' || s.tapped.includes(a.from)) return s;
      const heal = !!a.heal && s.potions.heal && !!s.victim;
      const poison = a.poison && s.potions.poison && s.alive.includes(a.poison) && a.poison !== a.from ? a.poison : null;
      return tap({ ...s, witchHeal: heal, witchPoison: poison });
    }
    case 'shoot': {
      if (!s.hunter || a.from !== s.hunter.id) return s;
      let n: S = { ...s, hunter: null };
      if (a.target && a.target !== a.from && n.alive.includes(a.target)) n = kill(n, [{ id: a.target, cause: 'hunter' }]);
      return startHunter(n, ctx);
    }
    case 'next': {
      if (!fromHost) return s;
      if ((s.phase === 'dawn' || s.phase === 'verdict') && !s.hunter && !s.hunterQueue.length) {
        const w = checkWin(s);
        if (w) return finish(s, w);
        if (s.phase === 'dawn') return { ...s, phase: 'discuss', deaths: [], discussDeadline: ctx.now + s.opts.discuss * 1000 };
        return startNight(s, ctx);
      }
      if (s.phase === 'discuss') return { ...s, phase: 'vote', votes: {}, voteDeadline: ctx.now + VOTE_SECS * 1000 };
      return s;
    }
    case 'vote':
      if (s.phase !== 'vote' || !alive || s.votes[a.from] || a.target === a.from || !s.alive.includes(a.target)) return s;
      return resolveVote({ ...s, votes: { ...s.votes, [a.from]: a.target } }, ctx, false);
    case 'again':
      if (s.phase !== 'end' || !fromHost) return s;
      return { ...s, phase: 'setup', game: s.game + 1 };
    case 'tick': {
      if (s.phase === 'setup' || s.phase === 'end') return s;
      let n = handleLeavers(s, ctx);
      if (n.phase === 'roles') return checkRolesDone(n, ctx);
      if (n.phase === 'night') {
        if (ctx.now >= n.stepDeadline || (ctx.now >= n.stepMinEnd && nightPending(n, ctx).length === 0)) return endStep(n, ctx);
        return n;
      }
      if ((n.phase === 'dawn' || n.phase === 'verdict') && n.hunter) {
        const h = n.hunter;
        if (ctx.now >= h.deadline) n = startHunter({ ...n, hunter: null }, ctx);
        return n;
      }
      if (n.phase === 'discuss' && ctx.now >= n.discussDeadline) return { ...n, phase: 'vote', votes: {}, voteDeadline: ctx.now + VOTE_SECS * 1000 };
      if (n.phase === 'vote') return resolveVote(n, ctx, ctx.now >= n.voteDeadline);
      return n;
    }
  }
  return s;
}

function checkRolesDone(s: S, ctx: OnlineCtx): S {
  const pres = presentIds(ctx);
  const need = s.alive.filter((id) => pres.has(id));
  if (need.length && need.every((id) => s.confirmed.includes(id))) return startNight(s, ctx);
  return s;
}

export function initState(ctx: OnlineCtx): S {
  return {
    phase: 'setup',
    opts: { wolves: suggestWolves(ctx.players.length), seer: true, witch: true, hunter: true, amor: false, discuss: 120 },
    game: 1,
    roles: {},
    info: {},
    alive: [],
    confirmed: [],
    lovers: null,
    potions: { heal: true, poison: true },
    night: 0,
    steps: [],
    stepIdx: 0,
    stepMinEnd: 0,
    stepDeadline: 0,
    tapped: [],
    wolfVotes: {},
    victim: null,
    seerPick: null,
    seerLog: [],
    witchHeal: false,
    witchPoison: null,
    amorPicks: [],
    deaths: [],
    hunter: null,
    hunterQueue: [],
    discussDeadline: 0,
    votes: {},
    voteDeadline: 0,
    lynched: null,
    tally: {},
    winner: null,
    scores: {},
    goneSince: {},
  };
}

/* ───────────────────────────── View ───────────────────────────── */

type VP = OnlineViewProps<S, A>;

function asMember(id: string, s: S, players: Member[]): Member {
  const live = players.find((p) => p.id === id);
  if (live) return live;
  const i = s.info[id] ?? { name: '???', avatar: '👤', color: '#888' };
  return { id, ...i, host: false, joinedAt: 0 };
}

function RoleCard({ s, me, players, startOpen }: { s: S; me: Member; players: Member[]; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  const role = s.roles[me.id];
  if (!role) return null;
  const ri = ROLE_INFO[role];
  const m = (id: string) => asMember(id, s, players);
  const lover = s.lovers?.includes(me.id) ? s.lovers.find((x) => x !== me.id) : null;
  const pack = role === 'wolf' ? Object.keys(s.roles).filter((id) => s.roles[id] === 'wolf' && id !== me.id) : [];
  return (
    <button
      className="card"
      style={{ '--cc': ri.evil ? '#ff2e88' : '#3dff6e', width: '100%', cursor: 'pointer' } as CSSProperties}
      onClick={() => {
        sfx.card();
        setOpen((o) => !o);
      }}
    >
      <div className="card-kicker">{open ? 'Deine Rolle · antippen zum Verdecken' : 'Deine Rolle · antippen zum Aufdecken'}</div>
      {open ? (
        <>
          <div className="card-emoji">{ri.emoji}</div>
          <div className="card-text pixel" style={{ fontSize: 16, color: ri.evil ? 'var(--pink)' : 'var(--green)' }}>
            {ri.name.toUpperCase()}
          </div>
          <div className="small">{ri.desc}</div>
          {pack.length > 0 && <div className="small">🐺 Dein Rudel: {pack.map((id) => m(id).name).join(', ')}</div>}
          {lover && <div className="small">💘 Du bist verliebt in {m(lover).name}!</div>}
          {role === 'witch' && (
            <div className="small">
              Tränke: {s.potions.heal ? '💚 Heilung' : '—'} · {s.potions.poison ? '☠️ Gift' : '—'}
            </div>
          )}
          {role === 'seer' && s.seerLog.length > 0 && (
            <div className="small">
              {s.seerLog.map((l) => (
                <div key={l.night + l.target}>
                  Nacht {l.night}: {m(l.target).name} ist {l.evil ? '🐺 BÖSE' : '😇 gut'}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card-emoji">🂠</div>
      )}
    </button>
  );
}

function SelectGrid({ ids, s, players, selected, onPick, counts }: { ids: string[]; s: S; players: Member[]; selected: string[]; onPick: (id: string) => void; counts?: Record<string, number> }) {
  return (
    <div className="grid2">
      {ids.map((id) => {
        const p = asMember(id, s, players);
        return (
          <button
            key={id}
            className="tile"
            style={{ '--tc': p.color, minHeight: 80, alignItems: 'center', outline: selected.includes(id) ? '4px solid var(--yellow)' : undefined } as CSSProperties}
            onClick={() => {
              sfx.select();
              onPick(id);
            }}
          >
            <span className="t-emoji">{p.avatar}</span>
            <span className="t-name" style={{ color: 'var(--ink)' }}>
              {p.name}
              {counts?.[id] ? ` · ${'🐺'.repeat(counts[id])}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NightTask({ s, me, players, send }: { s: S; me: Member; players: Member[]; send: VP['send'] }) {
  const step = s.steps[s.stepIdx];
  const role = s.roles[me.id];
  const done = s.tapped.includes(me.id);
  const others = s.alive.filter((id) => id !== me.id);
  const [picks, setPicks] = useState<string[]>([]);
  const [heal, setHeal] = useState(false);
  const [poison, setPoison] = useState<string | null>(null);
  const m = (id: string) => asMember(id, s, players);
  const sleepy = (
    <Panel>
      <p className="center">😴 Erledigt – Augen zu, bis der Hahn kräht.</p>
    </Panel>
  );

  if (step === 'wolves' && role === 'wolf') {
    const pack = aliveWith(s, 'wolf');
    const prey = s.alive.filter((id) => s.roles[id] !== 'wolf');
    const counts: Record<string, number> = {};
    for (const w of pack) if (s.wolfVotes[w]) counts[s.wolfVotes[w]] = (counts[s.wolfVotes[w]] ?? 0) + 1;
    return (
      <div className="col">
        <h3 className="center">🐺 Wen fressts ihr heute?</h3>
        <div className="row wrap center">
          {pack.map((id) => (
            <MemberChip key={id} m={m(id)} extra={<span>{s.wolfVotes[id] ? '✓' : '…'}</span>} />
          ))}
        </div>
        <SelectGrid ids={prey} s={s} players={players} selected={s.wolfVotes[me.id] ? [s.wolfVotes[me.id]] : []} counts={counts} onPick={(id) => send({ type: 'wolfVote', target: id })} />
        <p className="muted small center">Ihr könnt umentscheiden, bis die Nacht weiterzieht. Bei Gleichstand entscheidet der Zufall.</p>
      </div>
    );
  }
  if (step === 'seer' && role === 'seer') {
    if (s.seerPick) {
      const evil = s.roles[s.seerPick] === 'wolf';
      return (
        <Panel glow={evil ? 'pink' : 'cyan'}>
          <p className="center">
            {m(s.seerPick).avatar} <b>{m(s.seerPick).name}</b> ist …
          </p>
          <BigTitle color={evil ? 'var(--pink)' : 'var(--green)'}>{evil ? '🐺 BÖSE!' : '😇 GUT'}</BigTitle>
          <p className="muted small center">Merk’s dir – und jetzt Augen zu.</p>
        </Panel>
      );
    }
    return (
      <div className="col">
        <h3 className="center">🔮 Wem schaust du in die Seele?</h3>
        <SelectGrid ids={others} s={s} players={players} selected={[]} onPick={(id) => send({ type: 'seer', target: id })} />
      </div>
    );
  }
  if (step === 'witch' && role === 'witch') {
    if (done) return sleepy;
    const v = s.victim;
    return (
      <div className="col">
        <Panel glow="pink">
          {v ? (
            <p className="center">
              Die Wölfe haben sich <b>{m(v).name}</b> {v === me.id ? '(DICH!)' : ''} geholt. 🩸
            </p>
          ) : (
            <p className="center">Heute Nacht haben die Wölfe niemanden erwischt.</p>
          )}
        </Panel>
        {v && s.potions.heal && <Toggle label="💚 Heiltrank verwenden" hint="Einmal im ganzen Spiel" value={heal} onChange={setHeal} />}
        {s.potions.poison ? (
          <>
            <h3>☠️ Gifttrank auf … (optional)</h3>
            <SelectGrid ids={others} s={s} players={players} selected={poison ? [poison] : []} onPick={(id) => setPoison((p) => (p === id ? null : id))} />
          </>
        ) : (
          <p className="muted small">Gifttrank schon verbraucht.</p>
        )}
        <Button color="purple" block big onClick={() => send({ type: 'witch', heal, poison })}>
          Fertig 🧪
        </Button>
      </div>
    );
  }
  if (step === 'amor' && role === 'amor') {
    if (done) return sleepy;
    return (
      <div className="col">
        <h3 className="center">💘 Wähle zwei Verliebte</h3>
        <SelectGrid
          ids={s.alive}
          s={s}
          players={players}
          selected={picks}
          onPick={(id) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)))}
        />
        <Button color="pink" block big disabled={picks.length !== 2} onClick={() => send({ type: 'amor', a: picks[0], b: picks[1] })}>
          Pfeile abschießen 💘
        </Button>
      </div>
    );
  }
  // dummy task – looks like a real one, is ignored
  if (done) return sleepy;
  return (
    <div className="col">
      <h3 className="center">Tippe auf die Person, die du am verdächtigsten findest</h3>
      <SelectGrid ids={others} s={s} players={players} selected={[]} onPick={(id) => send({ type: 'tap', target: id })} />
    </div>
  );
}

function GhostNight({ s, players }: { s: S; players: Member[] }) {
  const m = (id: string) => asMember(id, s, players);
  const step = s.steps[s.stepIdx];
  return (
    <Panel>
      <p className="small">👻 Geistermodus – du siehst alles:</p>
      {step === 'wolves' &&
        aliveWith(s, 'wolf').map((w) => (
          <div key={w} className="small">
            🐺 {m(w).name} → {s.wolfVotes[w] ? m(s.wolfVotes[w]).name : '…'}
          </div>
        ))}
      {step === 'seer' && <div className="small">🔮 Seherin schaut auf: {s.seerPick ? m(s.seerPick).name : '…'}</div>}
      {step === 'witch' && (
        <div className="small">
          🧪 Opfer: {s.victim ? m(s.victim).name : 'niemand'} · {s.tapped.some((id) => s.roles[id] === 'witch') ? `Heilt: ${s.witchHeal ? 'ja' : 'nein'}, Gift: ${s.witchPoison ? m(s.witchPoison).name : '—'}` : 'überlegt …'}
        </div>
      )}
      {step === 'amor' && <div className="small">💘 Amor wählt: {s.amorPicks.map((id) => m(id).name).join(' & ') || '…'}</div>}
      <AllRoles s={s} players={players} />
    </Panel>
  );
}

function AllRoles({ s, players }: { s: S; players: Member[] }) {
  return (
    <div className="col" style={{ gap: 6, marginTop: 8 }}>
      {Object.keys(s.roles).map((id) => (
        <div className="score-row" key={id}>
          <MemberChip m={asMember(id, s, players)} dim={!s.alive.includes(id)} />
          <span className="grow" />
          <span className="small">
            {ROLE_INFO[s.roles[id]].emoji} {ROLE_INFO[s.roles[id]].name}
            {s.lovers?.includes(id) ? ' 💘' : ''}
            {!s.alive.includes(id) ? ' 💀' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeathList({ s, players, fill }: { s: S; players: Member[]; fill: VP['fill'] }) {
  const m = (id: string) => asMember(id, s, players);
  if (!s.deaths.length) return null;
  return (
    <div className="col" style={{ gap: 8 }}>
      {s.deaths.map((d) => {
        const r = ROLE_INFO[s.roles[d.id]];
        return (
          <Panel key={d.id + d.cause} glow="pink">
            <div className="row">
              <span style={{ fontSize: 34 }}>💀</span>
              <div className="grow">
                <b style={{ color: m(d.id).color }}>{m(d.id).name}</b> {d.cause === 'left' ? '' : 'wurde'} {CAUSE_TEXT[d.cause]}
                <div className="small">
                  War: {r.emoji} {r.name}
                </div>
              </div>
            </div>
          </Panel>
        );
      })}
      <p className="center">{fill('🍺 Wer gestorben ist, nimmt {s:2} – auf das eigene Begräbnis!')}</p>
    </div>
  );
}

function HunterBox({ s, me, players, send }: { s: S; me: Member; players: Member[]; send: VP['send'] }) {
  const h = s.hunter;
  if (!h) return null;
  const m = (id: string) => asMember(id, s, players);
  if (h.id === me.id)
    return (
      <Panel glow="yellow">
        <h3>🏹 Du bist der Jäger! Wen nimmst du mit?</h3>
        <Countdown deadline={h.deadline} total={HUNTER_SECS} />
        <SelectGrid ids={s.alive.filter((id) => id !== me.id)} s={s} players={players} selected={[]} onPick={(id) => send({ type: 'shoot', target: id })} />
        <Button color="ghost" small onClick={() => send({ type: 'shoot', target: null })}>
          Niemanden – Gnade walten lassen
        </Button>
      </Panel>
    );
  return (
    <Panel glow="yellow">
      <p className="center pulse">🏹 {m(h.id).name} war der Jäger und legt an …</p>
      <Countdown deadline={h.deadline} total={HUNTER_SECS} />
    </Panel>
  );
}

function View({ state: s, me, isHost, players, send, fill }: VP) {
  const [confetti, setConfetti] = useState(0);
  const m = (id: string) => asMember(id, s, players);
  const pres = new Set(players.map((p) => p.id));
  const inGame = s.phase !== 'setup' && s.roles[me.id] !== undefined;
  const alive = s.alive.includes(me.id);
  const ghost = inGame && !alive;
  const step = s.phase === 'night' ? s.steps[s.stepIdx] : null;

  useEffect(() => {
    if (s.phase === 'night') sfx.whoosh();
    if (s.phase === 'dawn' || s.phase === 'verdict') {
      if (s.deaths.length) {
        sfx.boom();
        buzz([100, 50, 200]);
      } else sfx.success();
    }
    if (s.phase === 'end' && s.winner) {
      if (inGame && isWinner(s, me.id, s.winner)) {
        sfx.fanfare();
        setConfetti(Date.now());
      } else sfx.fail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.night]);

  if (s.phase === 'setup') {
    const n = players.length;
    const o = s.opts;
    const set = (p: Partial<Opts>) => send({ type: 'opts', opts: p });
    const maxW = Math.min(3, maxWolves(n));
    return (
      <div className="col">
        <BigTitle>🐺 WERWOLF</BigTitle>
        <Panel>
          <p className="small">Die App ist der Erzähler – keiner muss aussetzen! In der Nacht schauen alle aufs Handy, aber jeder tippt was. So weiß keiner, wer wer ist. 🤫</p>
        </Panel>
        <h3>Werwölfe (Vorschlag: {suggestWolves(n)})</h3>
        {isHost ? (
          <Seg
            options={[1, 2, 3].filter((x) => x <= maxW).map((x) => ({ value: x, label: '🐺'.repeat(x) }))}
            value={Math.min(o.wolves, maxW)}
            onChange={(v) => set({ wolves: v })}
          />
        ) : (
          <p className="center">{'🐺'.repeat(Math.min(o.wolves, maxW))}</p>
        )}
        {isHost ? (
          <>
            <Toggle label="🔮 Seherin" value={o.seer} onChange={(v) => set({ seer: v })} />
            <Toggle label="🧪 Hexe" hint="1 Heiltrank + 1 Gifttrank" value={o.witch} onChange={(v) => set({ witch: v })} />
            <Toggle label="🏹 Jäger" value={o.hunter} onChange={(v) => set({ hunter: v })} />
            <Toggle label="💘 Amor" hint="Verliebt in Nacht 1 zwei Leute" value={o.amor} onChange={(v) => set({ amor: v })} />
            <h3>Diskussionszeit</h3>
            <Seg
              options={[60, 120, 180, 300].map((x) => ({ value: x, label: `${x / 60} min` }))}
              value={o.discuss}
              onChange={(v) => set({ discuss: v })}
            />
          </>
        ) : (
          <p className="center">
            {[o.seer && '🔮 Seherin', o.witch && '🧪 Hexe', o.hunter && '🏹 Jäger', o.amor && '💘 Amor'].filter(Boolean).join(' · ') || 'Nur Dorfbewohner'} · {o.discuss / 60} min Diskussion
          </p>
        )}
        <div className="row wrap">
          {players.map((p) => (
            <MemberChip key={p.id} m={p} />
          ))}
        </div>
        {n < 5 && <div className="notice">Werwolf braucht mindestens 5 Leute.</div>}
        {Object.keys(s.scores).length > 0 && <Scoreboard players={Object.keys(s.scores).map(m)} scores={s.scores} />}
        <HostButton isHost={isHost} onClick={() => send({ type: 'start' })} waitText="Der Host stellt das Dorf zusammen …">
          Rollen verteilen ▶
        </HostButton>
      </div>
    );
  }

  if (!inGame && s.phase !== 'end') {
    return (
      <div className="col">
        <BigTitle color="var(--cyan)">👀 Du schaust zu</BigTitle>
        <p className="center">In Gaudingen ist grad was los – nächstes Spiel bist du dabei!</p>
        <div className="row wrap">
          {s.alive.map((id) => (
            <MemberChip key={id} m={m(id)} />
          ))}
        </div>
      </div>
    );
  }

  const ghostBanner = ghost && s.phase !== 'end' && (
    <div className="notice">👻 Geistermodus – du bist tot. Schau zu, aber halt die Goschn!</div>
  );

  if (s.phase === 'roles') {
    const need = s.alive.filter((id) => pres.has(id));
    return (
      <div className="col">
        <BigTitle>Willkommen in Gaudingen</BigTitle>
        <p className="center small">Schau dir deine Rolle geheim an. Niemand darf mitschauen!</p>
        <RoleCard s={s} me={me} players={players} />
        {!s.confirmed.includes(me.id) ? (
          <Button color="green" block big onClick={() => send({ type: 'ok' })}>
            Verstanden ✓
          </Button>
        ) : (
          <WaitingFor players={need.map(m)} done={s.confirmed} />
        )}
      </div>
    );
  }

  if (s.phase === 'night' && step) {
    const intro = NIGHT_INTRO[(s.night - 1) % NIGHT_INTRO.length];
    const text = STEP_TEXT[step][(s.night + s.stepIdx) % STEP_TEXT[step].length];
    return (
      <div className="col" style={{ background: '#05021a', borderRadius: 12, padding: 12 }}>
        <BigTitle color="var(--cyan)">🌙 NACHT {s.night}</BigTitle>
        {s.stepIdx === 0 && <p className="center small muted">{intro}</p>}
        <Panel>
          <p className="center">{text}</p>
        </Panel>
        <Countdown deadline={s.stepDeadline} total={NIGHT_SECS} />
        {ghost ? (
          <>
            {ghostBanner}
            <GhostNight s={s} players={players} />
          </>
        ) : (
          <NightTask key={s.night + ':' + s.stepIdx} s={s} me={me} players={players} send={send} />
        )}
      </div>
    );
  }

  const roleCard = alive && <RoleCard s={s} me={me} players={players} />;
  const hostNextReady = !s.hunter && !s.hunterQueue.length;

  if (s.phase === 'dawn') {
    return (
      <div className="col">
        {ghostBanner}
        <BigTitle>☀️ TAG {s.night}</BigTitle>
        <p className="center">{DAWN_TEXT[(s.night - 1) % DAWN_TEXT.length]}</p>
        {s.deaths.length ? (
          <DeathList s={s} players={players} fill={fill} />
        ) : (
          <Panel glow="cyan">
            <p className="center">🙌 A Wunder! Heute Nacht ist niemand gestorben.</p>
          </Panel>
        )}
        <HunterBox s={s} me={me} players={players} send={send} />
        {roleCard}
        {ghost && <AllRoles s={s} players={players} />}
        {hostNextReady && (
          <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
            Zur Diskussion ▶
          </HostButton>
        )}
      </div>
    );
  }

  if (s.phase === 'discuss') {
    return (
      <div className="col">
        {ghostBanner}
        <BigTitle>🗣️ DORFVERSAMMLUNG</BigTitle>
        <p className="center small">Wer benimmt sich verdächtig? Diskutiert, beschuldigt, lügt – gleich wird abgestimmt.</p>
        <Countdown deadline={s.discussDeadline} total={s.opts.discuss} />
        <div className="row wrap">
          {s.alive.map((id) => (
            <MemberChip key={id} m={m(id)} />
          ))}
        </div>
        {roleCard}
        {ghost && <AllRoles s={s} players={players} />}
        <HostButton isHost={isHost} onClick={() => send({ type: 'next' })} color="pink" waitText="Gleich wird abgestimmt …">
          ⏩ Direkt zur Abstimmung
        </HostButton>
      </div>
    );
  }

  if (s.phase === 'vote') {
    const voters = s.alive.filter((id) => pres.has(id));
    return (
      <div className="col">
        {ghostBanner}
        <BigTitle color="var(--pink)">🪢 WER WIRD GELYNCHT?</BigTitle>
        <Countdown deadline={s.voteDeadline} total={VOTE_SECS} />
        {alive && !s.votes[me.id] ? (
          <VoteGrid players={s.alive.map(m)} exclude={[me.id]} onVote={(id) => send({ type: 'vote', target: id })} />
        ) : (
          <>
            {alive && <p className="center">Stimme abgegeben. Gleichstand = niemand stirbt.</p>}
            <WaitingFor players={voters.map(m)} done={Object.keys(s.votes)} />
          </>
        )}
        {ghost && <AllRoles s={s} players={players} />}
      </div>
    );
  }

  if (s.phase === 'verdict') {
    return (
      <div className="col">
        {ghostBanner}
        <BigTitle color="var(--pink)">⚖️ DAS URTEIL</BigTitle>
        {s.lynched ? (
          <p className="center">
            Das Dorf hat entschieden: <b style={{ color: m(s.lynched).color }}>{m(s.lynched).name}</b> muss dran glauben!
          </p>
        ) : (
          <Panel glow="cyan">
            <p className="center">🤷 Keine Mehrheit – heute wird niemand gelyncht. Das Dorf geht grantig ins Bett.</p>
          </Panel>
        )}
        <DeathList s={s} players={players} fill={fill} />
        {Object.keys(s.tally).length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            {Object.entries(s.tally)
              .sort((a, b) => b[1] - a[1])
              .map(([id, c]) => (
                <div className="score-row" key={id}>
                  <MemberChip m={m(id)} />
                  <span className="grow" />
                  <span className="val">
                    {'▮'.repeat(c)} {c}
                  </span>
                </div>
              ))}
          </div>
        )}
        <HunterBox s={s} me={me} players={players} send={send} />
        {roleCard}
        {ghost && <AllRoles s={s} players={players} />}
        {hostNextReady && (
          <HostButton isHost={isHost} onClick={() => send({ type: 'next' })} color="cyan">
            🌙 Die Nacht bricht an ▶
          </HostButton>
        )}
      </div>
    );
  }

  // end
  const w = s.winner ?? 'village';
  const title = w === 'village' ? '🧑‍🌾 DAS DORF GEWINNT!' : w === 'wolves' ? '🐺 DIE WERWÖLFE GEWINNEN!' : '💘 DAS LIEBESPAAR GEWINNT!';
  const text =
    w === 'village'
      ? 'Alle Wölfe sind erledigt. Gaudingen feiert beim Kirtag!'
      : w === 'wolves'
        ? 'Die Wölfe haben das Dorf übernommen. Gaudingen heißt jetzt Wolfsbach.'
        : 'Nur noch die zwei Turteltauben sind übrig – Liebe siegt!';
  const losers = Object.keys(s.roles).filter((id) => !isWinner(s, id, w));
  return (
    <div className="col">
      <Confetti fire={confetti} />
      <BigTitle color={w === 'wolves' ? 'var(--pink)' : 'var(--green)'}>{title}</BigTitle>
      <p className="center">{text}</p>
      {inGame && <p className="center">{isWinner(s, me.id, w) ? 'Leiwand – du hast gewonnen! 🏆' : 'Verloren. Prost trotzdem! 🍻'}</p>}
      <AllRoles s={s} players={players} />
      <Panel glow="pink">
        <p className="center">
          {fill('🍺 Verlierer trinken {s:3}:')} {losers.map((id) => m(id).name).join(', ') || '–'}
        </p>
        <p className="center small">{fill('Und wer gestorben ist, nimmt noch {s:1} extra.')}</p>
      </Panel>
      <Scoreboard players={Object.keys(s.scores).map(m)} scores={s.scores} title="Punkte (Sieg 2, tot gewonnen 1)" />
      <HostButton isHost={isHost} onClick={() => send({ type: 'again' })}>
        Neues Spiel ▶
      </HostButton>
    </div>
  );
}

export const werwolf: OnlineGameDef<S, A> = {
  id: 'werwolf',
  name: 'Werwolf',
  emoji: '🐺',
  tagline: 'Die App erzählt – alle spielen mit',
  color: '#ff2e88',
  minPlayers: 5,
  rules: [
    'Die App ist der Erzähler. Jeder bekommt geheim eine Rolle: Werwolf, Seherin, Hexe, Jäger, Amor oder Dorfbewohner.',
    'Nachts schauen ALLE aufs Handy und tippen etwas – wer keine Aufgabe hat, kriegt eine Schein-Aufgabe. So verrät niemand seine Rolle.',
    'Die Wölfe wählen ein Opfer, die Seherin durchschaut eine Person, die Hexe darf einmal heilen und einmal vergiften. Amor verliebt in der ersten Nacht zwei Leute.',
    'Am Morgen werden die Toten verkündet. Stirbt der Jäger, nimmt er jemanden mit.',
    'Dann wird diskutiert und abgestimmt – die Mehrheit wird gelyncht, bei Gleichstand niemand.',
    'Das Dorf gewinnt, wenn alle Wölfe tot sind. Die Wölfe gewinnen, wenn sie gleich viele sind wie der Rest. Das Liebespaar gewinnt, wenn nur noch die zwei übrig sind.',
    'Tote sind Geister: Sie sehen alles, sagen aber nix. Wer stirbt, trinkt 2 Schlucke.',
  ],
  init: initState,
  reduce,
  View,
};
