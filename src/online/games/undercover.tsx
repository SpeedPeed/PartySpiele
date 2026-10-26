import { useEffect, useState, type CSSProperties } from 'react';
import { Button, Confetti, Panel, Seg, Toggle } from '../../components/ui';
import { UNDERCOVER } from '../../data/undercover';
import { pick, shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, useSecondsLeft, HostButton, MemberChip, Scoreboard, TextAnswer, VoteGrid, WaitingFor } from '../kit';
import type { Member, OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';

type Role = 'civ' | 'under' | 'white';
type Winner = 'civ' | 'imp' | 'white';
type Phase = 'setup' | 'reveal' | 'describe' | 'vote' | 'elimination' | 'end';
interface Info {
  name: string;
  avatar: string;
  color: string;
}

interface S {
  phase: Phase;
  opts: { under: number; white: boolean };
  game: number;
  round: number;
  words: { civ: string; under: string };
  roles: Record<string, Role>;
  info: Record<string, Info>;
  alive: string[];
  /** Elimination order (voted out). */
  out: string[];
  /** Participants that left the room for good. */
  left: string[];
  seen: string[];
  order: string[];
  votes: Record<string, string>;
  runoff: string[] | null;
  lastOut: string | null;
  lastTally: Record<string, number>;
  guess: string | null;
  guessOk: boolean | null;
  guessDeadline: number | null;
  winner: Winner | null;
  scores: Record<string, number>;
  goneSince: Record<string, number>;
}

type A =
  | { type: 'opts'; under: number; white: boolean }
  | { type: 'start' }
  | { type: 'seen' }
  | { type: 'startVote' }
  | { type: 'vote'; target: string }
  | { type: 'guess'; word: string }
  | { type: 'continue' }
  | { type: 'again' };

const GUESS_SECS = 60;
const LEAVE_MS = 30000;
const POINTS: Record<Role, number> = { civ: 2, under: 4, white: 6 };
export const ROLE_LABEL: Record<Role, string> = { civ: '😇 Bürger', under: '🕵️ Undercover', white: '🎩 Mr. White' };

/** Lowercase, umlauts → ae/oe/ue, no accents, no spaces/punctuation. */
export function normWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const hostId = (ctx: OnlineCtx) => ctx.players.find((p) => p.host)?.id;
const presentIds = (ctx: OnlineCtx) => new Set(ctx.players.map((p) => p.id));

export function maxImpostors(n: number): number {
  return Math.max(1, Math.floor((n - 1) / 2));
}

export function clampOpts(o: { under: number; white: boolean }, n: number) {
  const max = maxImpostors(n);
  const white = o.white && max >= 2;
  const under = Math.max(1, Math.min(3, max - (white ? 1 : 0), Math.round(o.under) || 1));
  return { under, white };
}

function isImp(r: Role | undefined) {
  return r === 'under' || r === 'white';
}

function speakOrder(s: S): string[] {
  const o = shuffle(s.alive);
  // Mr. White never has to start – that would be too mean.
  if (o.length > 1 && s.roles[o[0]] === 'white') o.push(o.shift()!);
  return o;
}

export function checkWin(s: S): Winner | null {
  const civ = s.alive.filter((id) => s.roles[id] === 'civ').length;
  const imp = s.alive.filter((id) => isImp(s.roles[id])).length;
  if (imp === 0) return 'civ';
  if (civ <= 1 || imp >= civ) return 'imp';
  return null;
}

function isWinner(r: Role, w: Winner): boolean {
  if (w === 'civ') return r === 'civ';
  if (w === 'white') return r === 'white';
  return isImp(r);
}

function finish(s: S, winner: Winner): S {
  const scores = { ...s.scores };
  for (const [id, r] of Object.entries(s.roles)) if (isWinner(r, winner)) scores[id] = (scores[id] ?? 0) + POINTS[r];
  return { ...s, phase: 'end', winner, scores };
}

function startGame(s: S, ctx: OnlineCtx): S {
  const ids = shuffle(ctx.players.map((p) => p.id));
  if (ids.length < 3) return s;
  const opts = clampOpts(s.opts, ids.length);
  const roles: Record<string, Role> = {};
  ids.forEach((id, i) => {
    roles[id] = i < opts.under ? 'under' : i === opts.under && opts.white ? 'white' : 'civ';
  });
  const info: Record<string, Info> = {};
  for (const p of ctx.players) info[p.id] = { name: p.name, avatar: p.avatar, color: p.color };
  const pair = pick(UNDERCOVER);
  const swap = Math.random() < 0.5;
  const next: S = {
    ...s,
    opts,
    phase: 'reveal',
    round: 1,
    words: { civ: swap ? pair.b : pair.a, under: swap ? pair.a : pair.b },
    roles,
    info,
    alive: ids,
    out: [],
    left: [],
    seen: [],
    order: [],
    votes: {},
    runoff: null,
    lastOut: null,
    lastTally: {},
    guess: null,
    guessOk: null,
    guessDeadline: null,
    winner: null,
    goneSince: {},
  };
  return { ...next, order: speakOrder(next) };
}

function afterReveal(s: S, ctx: OnlineCtx): S {
  const pres = presentIds(ctx);
  const need = s.alive.filter((id) => pres.has(id));
  if (need.length && need.every((id) => s.seen.includes(id))) return { ...s, phase: 'describe' };
  return s;
}

function tryResolveVote(s: S, ctx: OnlineCtx): S {
  const pres = presentIds(ctx);
  const voters = s.alive.filter((id) => pres.has(id));
  if (!voters.length || !voters.every((id) => s.votes[id])) return s;
  const cands = s.runoff ?? s.alive;
  const tally: Record<string, number> = {};
  for (const v of voters) {
    const t = s.votes[v];
    if (cands.includes(t)) tally[t] = (tally[t] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  if (top.length === 1) {
    const out = top[0];
    return {
      ...s,
      phase: 'elimination',
      alive: s.alive.filter((id) => id !== out),
      out: [...s.out, out],
      lastOut: out,
      lastTally: tally,
      runoff: null,
      guess: null,
      guessOk: null,
      guessDeadline: s.roles[out] === 'white' ? ctx.now + GUESS_SECS * 1000 : null,
    };
  }
  if (!s.runoff && top.length > 1) return { ...s, runoff: top, votes: {}, lastTally: tally };
  // Tie in the runoff (or nobody voted): nobody flies.
  return { ...s, phase: 'elimination', lastOut: null, lastTally: tally, runoff: null, guess: null, guessOk: null, guessDeadline: null };
}

function nextRound(s: S): S {
  const w = checkWin(s);
  if (w) return finish(s, w);
  const n: S = { ...s, phase: 'describe', round: s.round + 1, votes: {}, runoff: null, lastOut: null, guess: null, guessOk: null, guessDeadline: null };
  return { ...n, order: speakOrder(n) };
}

/** Removes participants who have been gone for a while. */
function handleLeavers(s: S, ctx: OnlineCtx): S {
  const pres = presentIds(ctx);
  let goneSince = s.goneSince;
  let changed = false;
  const kick: string[] = [];
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
    } else if (ctx.now - goneSince[id] > LEAVE_MS) kick.push(id);
  }
  if (!changed && !kick.length) return s;
  let n: S = { ...s, goneSince };
  if (kick.length) {
    const votes = { ...n.votes };
    for (const v of Object.keys(votes)) if (kick.includes(v) || kick.includes(votes[v])) delete votes[v];
    n = {
      ...n,
      alive: n.alive.filter((id) => !kick.includes(id)),
      left: [...n.left, ...kick],
      order: n.order.filter((id) => !kick.includes(id)),
      votes,
      runoff: n.runoff ? n.runoff.filter((id) => !kick.includes(id)) : null,
    };
    if (n.runoff && n.runoff.length < 2) n = { ...n, runoff: null, votes: {} };
    if (n.phase !== 'elimination') {
      const w = checkWin(n);
      if (w) return finish(n, w);
    }
  }
  return n;
}

function reduce(s: S, a: (A | { type: 'tick' }) & { from: string }, ctx: OnlineCtx): S {
  const fromHost = a.from === hostId(ctx);
  switch (a.type) {
    case 'opts':
      if (s.phase !== 'setup' || !fromHost) return s;
      return { ...s, opts: clampOpts({ under: a.under, white: a.white }, ctx.players.length) };
    case 'start':
      if (s.phase !== 'setup' || !fromHost) return s;
      return startGame(s, ctx);
    case 'seen':
      if (s.phase !== 'reveal' || !s.alive.includes(a.from) || s.seen.includes(a.from)) return s;
      return afterReveal({ ...s, seen: [...s.seen, a.from] }, ctx);
    case 'startVote':
      if (s.phase !== 'describe' || !fromHost) return s;
      return { ...s, phase: 'vote', votes: {}, runoff: null };
    case 'vote': {
      if (s.phase !== 'vote' || !s.alive.includes(a.from) || s.votes[a.from] || a.target === a.from) return s;
      const cands = s.runoff ?? s.alive;
      if (!cands.includes(a.target)) return s;
      return tryResolveVote({ ...s, votes: { ...s.votes, [a.from]: a.target } }, ctx);
    }
    case 'guess': {
      if (s.phase !== 'elimination' || a.from !== s.lastOut || s.roles[a.from] !== 'white' || s.guess !== null) return s;
      const ok = normWord(a.word) !== '' && normWord(a.word) === normWord(s.words.civ);
      const n = { ...s, guess: a.word.slice(0, 40), guessOk: ok };
      return ok ? finish(n, 'white') : n;
    }
    case 'continue': {
      if (s.phase !== 'elimination' || !fromHost) return s;
      const waitingForWhite =
        s.lastOut && s.roles[s.lastOut] === 'white' && s.guess === null && s.guessDeadline && ctx.now < s.guessDeadline && presentIds(ctx).has(s.lastOut);
      if (waitingForWhite) return s;
      return nextRound(s);
    }
    case 'again':
      if (s.phase !== 'end' || !fromHost) return s;
      return { ...s, phase: 'setup', game: s.game + 1, opts: clampOpts(s.opts, ctx.players.length) };
    case 'tick': {
      if (s.phase === 'setup' || s.phase === 'end') return s;
      let n = handleLeavers(s, ctx);
      if (n.phase === 'reveal') n = afterReveal(n, ctx);
      else if (n.phase === 'vote') n = tryResolveVote(n, ctx);
      return n;
    }
  }
  return s;
}

/* ───────────────────────────── View ───────────────────────────── */

function asMember(id: string, s: S, players: Member[]): Member {
  const live = players.find((p) => p.id === id);
  if (live) return live;
  const i = s.info[id] ?? { name: '???', avatar: '👤', color: '#888' };
  return { id, ...i, host: false, joinedAt: 0 };
}

function WordCard({ s, me }: { s: S; me: Member }) {
  const [open, setOpen] = useState(false);
  const role = s.roles[me.id];
  const word = role === 'white' ? null : role === 'under' ? s.words.under : s.words.civ;
  return (
    <button
      className="card"
      style={{ '--cc': '#a64dff', width: '100%', cursor: 'pointer', minHeight: 170 } as CSSProperties}
      onClick={() => {
        sfx.card();
        setOpen((o) => !o);
      }}
    >
      <div className="card-kicker">{open ? 'Antippen zum Verdecken' : 'Antippen zum Aufdecken – keiner schaut mit!'}</div>
      {open ? (
        word ? (
          <>
            <div className="muted small">Dein Wort:</div>
            <div className="card-text pixel" style={{ fontSize: 22, color: 'var(--yellow)' }}>
              {word}
            </div>
          </>
        ) : (
          <>
            <div className="card-emoji">🎩</div>
            <div className="card-text">Du bist MR. WHITE!</div>
            <div className="small">Du hast kein Wort. Hör gut zu und bluff dich durch, Oida!</div>
          </>
        )
      ) : (
        <div className="card-emoji">🂠</div>
      )}
    </button>
  );
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [confetti, setConfetti] = useState(0);
  const myRole = s.roles[me.id];
  const inGame = s.phase !== 'setup' && myRole !== undefined;
  const alive = s.alive.includes(me.id);
  const pres = new Set(players.map((p) => p.id));
  const m = (id: string) => asMember(id, s, players);
  const guessLeft = useSecondsLeft(s.phase === 'elimination' ? s.guessDeadline : null);

  useEffect(() => {
    if (s.phase === 'elimination') {
      sfx.boom();
      buzz([80, 40, 120]);
    }
    if (s.phase === 'end') {
      if (myRole && s.winner && isWinner(myRole, s.winner)) {
        sfx.fanfare();
        setConfetti(Date.now());
      } else sfx.fail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);

  if (s.phase === 'setup') {
    const n = players.length;
    const opts = clampOpts(s.opts, n);
    const maxU = Math.min(3, maxImpostors(n) - (opts.white ? 1 : 0));
    return (
      <div className="col">
        <BigTitle>🕵️ UNDERCOVER</BigTitle>
        <Panel>
          <p className="small">
            Alle Bürger kriegen dasselbe Wort, die Undercover ein ähnliches – und Mr. White gar keins. Reihum sagt jeder EIN Wort dazu, dann wird abgestimmt, wer
            fliegt. Leiwand!
          </p>
        </Panel>
        <h3>Undercover-Agenten</h3>
        {isHost ? (
          <Seg
            options={[1, 2, 3].filter((x) => x <= Math.max(1, maxU)).map((x) => ({ value: x, label: `${x} 🕵️` }))}
            value={opts.under}
            onChange={(v) => send({ type: 'opts', under: v, white: opts.white })}
          />
        ) : (
          <p className="center">{opts.under} 🕵️</p>
        )}
        {isHost ? (
          maxImpostors(n) >= 2 ? (
            <Toggle label="🎩 Mr. White mitspielen lassen" hint="Bekommt kein Wort – fliegt er raus, darf er das Bürger-Wort raten." value={opts.white} onChange={(v) => send({ type: 'opts', under: opts.under, white: v })} />
          ) : (
            <p className="muted small">Mr. White gibt’s ab 5 Spielern.</p>
          )
        ) : (
          <p className="center">{opts.white ? '🎩 Mr. White spielt mit' : 'Ohne Mr. White'}</p>
        )}
        <div className="row wrap">
          {players.map((p) => (
            <MemberChip key={p.id} m={p} />
          ))}
        </div>
        {Object.keys(s.scores).length > 0 && <Scoreboard players={players} scores={s.scores} />}
        <HostButton isHost={isHost} onClick={() => send({ type: 'start' })} waitText="Der Host stellt die Runde ein …">
          Wörter verteilen ▶
        </HostButton>
      </div>
    );
  }

  if (!inGame && s.phase !== 'end') {
    return (
      <div className="col">
        <BigTitle color="var(--cyan)">👀 Du schaust zu</BigTitle>
        <p className="center">Die Runde läuft schon – nächste Runde bist du dabei!</p>
        <div className="row wrap">
          {s.alive.map((id) => (
            <MemberChip key={id} m={m(id)} />
          ))}
        </div>
      </div>
    );
  }

  const ghost = inGame && !alive && s.phase !== 'end';
  const ghostBanner = ghost && (
    <Panel glow="pink">
      <div className="center" style={{ fontSize: 40 }}>
        👻
      </div>
      <p className="center">Du bist raus – trink was und schweig! 🤐</p>
    </Panel>
  );
  const leftNotice = s.left.length > 0 && s.phase !== 'end' && (
    <p className="muted small center">🚪 Abgehauen: {s.left.map((id) => m(id).name).join(', ')}</p>
  );

  if (s.phase === 'reveal') {
    const need = s.alive.filter((id) => pres.has(id));
    return (
      <div className="col">
        <BigTitle>Geheimes Wort</BigTitle>
        <WordCard s={s} me={me} />
        {!s.seen.includes(me.id) ? (
          <Button color="green" block big onClick={() => send({ type: 'seen' })}>
            Gesehen ✓
          </Button>
        ) : (
          <WaitingFor players={need.map(m)} done={s.seen} />
        )}
      </div>
    );
  }

  if (s.phase === 'describe') {
    return (
      <div className="col">
        {ghostBanner}
        <BigTitle>Runde {s.round}: Beschreiben</BigTitle>
        <p className="center small">Reihum sagt jeder EIN Wort zu seinem Begriff – laut! Nicht zu eindeutig, sonst kriegen’s die Falschen mit.</p>
        <div className="col" style={{ gap: 6 }}>
          {s.order.map((id, i) => (
            <div className="score-row" key={id} style={{ outline: id === me.id ? '2px solid var(--yellow)' : undefined }}>
              <span className="rank">{i + 1}.</span>
              <MemberChip m={m(id)} />
              <span className="grow" />
              {!pres.has(id) && <span className="small muted">offline</span>}
            </div>
          ))}
        </div>
        {alive && <WordCard s={s} me={me} />}
        {leftNotice}
        <HostButton isHost={isHost} onClick={() => send({ type: 'startVote' })} color="pink" waitText="Wenn alle was gesagt haben, startet der Host die Abstimmung.">
          🗳️ Abstimmung starten
        </HostButton>
      </div>
    );
  }

  if (s.phase === 'vote') {
    const cands = (s.runoff ?? s.alive).map(m);
    const voters = s.alive.filter((id) => pres.has(id));
    return (
      <div className="col">
        {ghostBanner}
        <BigTitle color="var(--pink)">{s.runoff ? '⚔️ STICHWAHL' : '🗳️ Wer ist verdächtig?'}</BigTitle>
        {s.runoff && <p className="center small">Gleichstand! Jetzt nur noch zwischen den Meistgewählten.</p>}
        {alive && !s.votes[me.id] ? (
          <VoteGrid players={cands} exclude={[me.id]} onVote={(id) => send({ type: 'vote', target: id })} />
        ) : (
          <>
            {alive && <p className="center">Stimme abgegeben 🤐</p>}
            <WaitingFor players={voters.map(m)} done={Object.keys(s.votes)} />
          </>
        )}
        {leftNotice}
      </div>
    );
  }

  if (s.phase === 'elimination') {
    const out = s.lastOut;
    const role = out ? s.roles[out] : null;
    const whiteGuessing = out && role === 'white' && s.guess === null;
    const canContinue = !whiteGuessing || !s.guessDeadline || guessLeft <= 0 || !pres.has(out!);
    return (
      <div className="col">
        {ghost && out !== me.id && ghostBanner}
        {out ? (
          <>
            <p className="center">Rausgewählt wurde …</p>
            <BigTitle color={m(out).color}>
              {m(out).avatar} {m(out).name}
            </BigTitle>
            <Panel glow={role === 'civ' ? 'cyan' : 'pink'}>
              <div className="center pixel" style={{ fontSize: 14, lineHeight: 1.8 }}>
                {role ? ROLE_LABEL[role] : '?'}
              </div>
              <p className="center small">{role === 'civ' ? 'Oida, ein Unschuldiger! 😬' : role === 'under' ? 'Erwischt! Na servas! 🎯' : 'Mr. White enttarnt! Aber er darf noch raten …'}</p>
            </Panel>
            {out === me.id && role !== 'white' && <p className="center">{fill('Du bist raus 👻 – trink {s:1} auf dein Begräbnis.')}</p>}
          </>
        ) : (
          <>
            <BigTitle color="var(--cyan)">🤝 Gleichstand!</BigTitle>
            <p className="center">Auch in der Stichwahl keine Einigkeit – diesmal fliegt niemand.</p>
          </>
        )}
        {Object.keys(s.lastTally).length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            {Object.entries(s.lastTally)
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
        {whiteGuessing && out === me.id && (
          <Panel glow="yellow">
            <h3>🎩 Letzte Chance!</h3>
            <p className="small">Wie lautet das Wort der Bürger? Triffst du, gewinnst du allein!</p>
            <Countdown deadline={s.guessDeadline} total={GUESS_SECS} />
            <TextAnswer onSubmit={(w) => send({ type: 'guess', word: w })} placeholder="Das Wort ist …" maxLength={40} />
          </Panel>
        )}
        {whiteGuessing && out !== me.id && (
          <Panel>
            <p className="center pulse">🎩 Mr. White grübelt über das Wort …</p>
            <Countdown deadline={s.guessDeadline} total={GUESS_SECS} />
          </Panel>
        )}
        {s.guess !== null && !s.guessOk && (
          <p className="center">
            Mr. White tippt „{s.guess}“ – <b style={{ color: 'var(--red)' }}>FALSCH!</b> 😂
          </p>
        )}
        {leftNotice}
        {canContinue ? (
          <HostButton isHost={isHost} onClick={() => send({ type: 'continue' })}>
            Weiter ▶
          </HostButton>
        ) : (
          <p className="muted center small">Warten auf Mr. White …</p>
        )}
      </div>
    );
  }

  // end
  const w = s.winner ?? 'civ';
  const iWon = myRole ? isWinner(myRole, w) : false;
  const title = w === 'civ' ? '😇 DIE BÜRGER GEWINNEN!' : w === 'white' ? '🎩 MR. WHITE GEWINNT!' : '🕵️ DIE UNDERCOVER GEWINNEN!';
  const losers = Object.keys(s.roles).filter((id) => !isWinner(s.roles[id], w));
  return (
    <div className="col">
      <Confetti fire={confetti} />
      <BigTitle color={w === 'civ' ? 'var(--green)' : 'var(--pink)'}>{title}</BigTitle>
      {w === 'white' && s.guess && <p className="center">Mr. White hat „{s.guess}“ erraten – Wahnsinn! 🤯</p>}
      {myRole && <p className="center">{iWon ? 'Leiwand, du hast gewonnen! 🏆' : 'Verloren – Prost trotzdem! 🍻'}</p>}
      <Panel glow="cyan">
        <div className="row between">
          <span>😇 Bürger-Wort</span>
          <b style={{ color: 'var(--yellow)' }}>{s.words.civ}</b>
        </div>
        <div className="row between">
          <span>🕵️ Undercover-Wort</span>
          <b style={{ color: 'var(--pink)' }}>{s.words.under}</b>
        </div>
      </Panel>
      <div className="col" style={{ gap: 6 }}>
        {Object.keys(s.roles).map((id) => (
          <div className="score-row" key={id}>
            <MemberChip m={m(id)} dim={!s.alive.includes(id)} />
            <span className="grow" />
            <span className="small">
              {ROLE_LABEL[s.roles[id]]}
              {!s.alive.includes(id) ? ' 💀' : ''}
            </span>
          </div>
        ))}
      </div>
      <Panel glow="pink">
        <p className="center">
          {fill('🍺 Verlierer trinken {s:2}:')}
          <br />
          {losers.map((id) => m(id).name).join(', ')}
        </p>
      </Panel>
      <Scoreboard players={Object.keys(s.scores).map(m)} scores={s.scores} title="Punkte (alle Runden)" />
      <HostButton isHost={isHost} onClick={() => send({ type: 'again' })}>
        Nächste Runde ▶
      </HostButton>
    </div>
  );
}

export const undercover: OnlineGameDef<S, A> = {
  id: 'undercover',
  name: 'Undercover',
  emoji: '🕵️',
  tagline: 'Wer hat das falsche Wort?',
  color: '#a64dff',
  minPlayers: 3,
  rules: [
    'Jeder bekommt geheim ein Wort aufs Handy. Die Bürger haben alle dasselbe, die Undercover ein ähnliches (sie wissen nicht, dass sie Undercover sind!).',
    'Mr. White (optional) bekommt gar kein Wort und muss bluffen.',
    'Reihum sagt jeder EIN Wort zu seinem Begriff. Dann wird abgestimmt, wer rausfliegt – bei Gleichstand gibt’s eine Stichwahl, sonst fliegt niemand.',
    'Fliegt Mr. White raus, darf er das Bürger-Wort raten. Richtig = er gewinnt allein.',
    'Bürger gewinnen, wenn alle Undercover und Mr. White draußen sind. Die Undercover gewinnen, wenn nur noch ein Bürger übrig ist oder sie gleich viele sind.',
    'Ausgeschiedene schweigen und trinken. Die Verlierer-Mannschaft trinkt am Ende 2 Schlucke.',
  ],
  init: (ctx) => ({
    phase: 'setup',
    opts: clampOpts({ under: 1, white: false }, ctx.players.length),
    game: 1,
    round: 0,
    words: { civ: '', under: '' },
    roles: {},
    info: {},
    alive: [],
    out: [],
    left: [],
    seen: [],
    order: [],
    votes: {},
    runoff: null,
    lastOut: null,
    lastTally: {},
    guess: null,
    guessOk: null,
    guessDeadline: null,
    winner: null,
    scores: {},
    goneSince: {},
  }),
  reduce,
  View,
};
