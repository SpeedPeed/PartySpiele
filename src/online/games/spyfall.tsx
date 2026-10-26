import { useEffect, useState, type CSSProperties } from 'react';
import { Button, Confetti, Modal, Panel, Seg } from '../../components/ui';
import { SPYFALL } from '../../data/spyfall';
import { pick, rand, shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, MemberChip, Scoreboard, VoteGrid, WaitingFor } from '../kit';
import type { Member, OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';

type Phase = 'setup' | 'play' | 'accuse' | 'final' | 'result';
interface Info {
  name: string;
  avatar: string;
  color: string;
}
interface Accusation {
  by: string;
  target: string;
  votes: Record<string, boolean>;
}
interface Result {
  winner: 'spy' | 'civ';
  reason: 'caught' | 'framed' | 'guessRight' | 'guessWrong' | 'finalCaught' | 'finalMissed' | 'spyLeft';
  accused?: string;
  guess?: number;
}

interface S {
  phase: Phase;
  opts: { minutes: number };
  round: number;
  loc: number;
  spy: string;
  roles: Record<string, string>;
  info: Record<string, Info>;
  participants: string[];
  starter: string;
  deadline: number;
  total: number;
  /** ms left on the clock while an accusation pauses it. */
  paused: number | null;
  accusation: Accusation | null;
  usedAccuse: string[];
  finalVotes: Record<string, string>;
  finalDeadline: number | null;
  result: Result | null;
  spyGoneSince: number | null;
  scores: Record<string, number>;
}

type A =
  | { type: 'opts'; minutes: number }
  | { type: 'start' }
  | { type: 'accuse'; target: string }
  | { type: 'accuseVote'; yes: boolean }
  | { type: 'spyGuess'; loc: number }
  | { type: 'finalVote'; target: string }
  | { type: 'endTime' }
  | { type: 'next' };

const MINUTES = [5, 8, 10];
const FINAL_SECS = 90;
const SPY_LEAVE_MS = 45000;

const hostId = (ctx: OnlineCtx) => ctx.players.find((p) => p.host)?.id;
const presentIds = (ctx: OnlineCtx) => new Set(ctx.players.map((p) => p.id));

function startRound(s: S, ctx: OnlineCtx): S {
  const ids = ctx.players.map((p) => p.id);
  if (ids.length < 3) return s;
  const loc = rand(SPYFALL.length);
  const spy = pick(ids);
  const pool = shuffle(SPYFALL[loc].rollen);
  const roles: Record<string, string> = {};
  let i = 0;
  for (const id of ids) if (id !== spy) roles[id] = pool[i++ % pool.length];
  const info: Record<string, Info> = {};
  for (const p of ctx.players) info[p.id] = { name: p.name, avatar: p.avatar, color: p.color };
  const total = s.opts.minutes * 60;
  return {
    ...s,
    phase: 'play',
    round: s.round + 1,
    loc,
    spy,
    roles,
    info,
    participants: ids,
    starter: pick(ids),
    deadline: ctx.now + total * 1000,
    total,
    paused: null,
    accusation: null,
    usedAccuse: [],
    finalVotes: {},
    finalDeadline: null,
    result: null,
    spyGoneSince: null,
  };
}

function finish(s: S, result: Result): S {
  const scores = { ...s.scores };
  const add = (id: string, n: number) => (scores[id] = (scores[id] ?? 0) + n);
  if (result.winner === 'spy') {
    add(s.spy, result.reason === 'guessRight' || result.reason === 'framed' ? 4 : 2);
  } else if (result.reason !== 'spyLeft') {
    for (const id of s.participants) if (id !== s.spy) add(id, 1);
    if (result.reason === 'caught' && s.accusation) add(s.accusation.by, 1);
  }
  return { ...s, phase: 'result', result, paused: null, scores };
}

function toFinal(s: S, ctx: OnlineCtx): S {
  return { ...s, phase: 'final', accusation: null, paused: null, finalVotes: {}, finalDeadline: ctx.now + FINAL_SECS * 1000 };
}

function resumeOrFinal(s: S, ctx: OnlineCtx): S {
  const left = s.paused ?? 0;
  if (left <= 0) return toFinal(s, ctx);
  return { ...s, phase: 'play', accusation: null, paused: null, deadline: ctx.now + left };
}

function tryResolveAccusation(s: S, ctx: OnlineCtx): S {
  const acc = s.accusation;
  if (s.phase !== 'accuse' || !acc) return s;
  const pres = presentIds(ctx);
  const voters = s.participants.filter((id) => id !== acc.target && pres.has(id));
  if (voters.some((id) => acc.votes[id] === false)) return resumeOrFinal(s, ctx);
  if (!voters.length || !voters.every((id) => acc.votes[id] === true)) return s;
  // unanimous
  if (acc.target === s.spy) return finish(s, { winner: 'civ', reason: 'caught', accused: acc.target });
  return finish(s, { winner: 'spy', reason: 'framed', accused: acc.target });
}

function tryResolveFinal(s: S, ctx: OnlineCtx, force = false): S {
  if (s.phase !== 'final') return s;
  const pres = presentIds(ctx);
  const voters = s.participants.filter((id) => pres.has(id));
  if (!force && (!voters.length || !voters.every((id) => s.finalVotes[id]))) return s;
  const tally: Record<string, number> = {};
  for (const v of Object.keys(s.finalVotes)) {
    const t = s.finalVotes[v];
    tally[t] = (tally[t] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  const accused = top.length === 1 ? top[0] : undefined;
  if (accused && accused === s.spy) return finish(s, { winner: 'civ', reason: 'finalCaught', accused });
  return finish(s, { winner: 'spy', reason: 'finalMissed', accused });
}

function reduce(s: S, a: (A | { type: 'tick' }) & { from: string }, ctx: OnlineCtx): S {
  const fromHost = a.from === hostId(ctx);
  const isPart = s.participants.includes(a.from);
  switch (a.type) {
    case 'opts':
      if (s.phase !== 'setup' || !fromHost || !MINUTES.includes(a.minutes)) return s;
      return { ...s, opts: { minutes: a.minutes } };
    case 'start':
      if ((s.phase !== 'setup' && s.phase !== 'result') || !fromHost) return s;
      return startRound(s, ctx);
    case 'next':
      if (!fromHost) return s;
      if (s.phase === 'result') return { ...s, phase: 'setup' };
      if (s.phase === 'play' || s.phase === 'accuse' || s.phase === 'final') return { ...s, phase: 'setup', accusation: null, paused: null };
      return s;
    case 'accuse': {
      if (s.phase !== 'play' || !isPart || s.usedAccuse.includes(a.from) || a.target === a.from || !s.participants.includes(a.target)) return s;
      const n: S = {
        ...s,
        phase: 'accuse',
        paused: Math.max(0, s.deadline - ctx.now),
        accusation: { by: a.from, target: a.target, votes: { [a.from]: true } },
        usedAccuse: [...s.usedAccuse, a.from],
      };
      return tryResolveAccusation(n, ctx);
    }
    case 'accuseVote': {
      const acc = s.accusation;
      if (s.phase !== 'accuse' || !acc || !isPart || a.from === acc.target || a.from in acc.votes) return s;
      return tryResolveAccusation({ ...s, accusation: { ...acc, votes: { ...acc.votes, [a.from]: !!a.yes } } }, ctx);
    }
    case 'spyGuess': {
      if ((s.phase !== 'play' && s.phase !== 'accuse') || a.from !== s.spy || !(a.loc >= 0 && a.loc < SPYFALL.length)) return s;
      return finish(s, { winner: a.loc === s.loc ? 'spy' : 'civ', reason: a.loc === s.loc ? 'guessRight' : 'guessWrong', guess: a.loc });
    }
    case 'endTime':
      if (s.phase !== 'play' || !fromHost) return s;
      return toFinal(s, ctx);
    case 'finalVote':
      if (s.phase !== 'final' || !isPart || s.finalVotes[a.from] || a.target === a.from || !s.participants.includes(a.target)) return s;
      return tryResolveFinal({ ...s, finalVotes: { ...s.finalVotes, [a.from]: a.target } }, ctx);
    case 'tick': {
      if (s.phase === 'play' || s.phase === 'accuse' || s.phase === 'final') {
        const here = presentIds(ctx).has(s.spy);
        if (here && s.spyGoneSince) s = { ...s, spyGoneSince: null };
        else if (!here && !s.spyGoneSince) s = { ...s, spyGoneSince: ctx.now };
        else if (!here && s.spyGoneSince && ctx.now - s.spyGoneSince > SPY_LEAVE_MS) return finish(s, { winner: 'civ', reason: 'spyLeft' });
      }
      if (s.phase === 'play') {
        if (ctx.now >= s.deadline) return toFinal(s, ctx);
        return s;
      }
      if (s.phase === 'accuse') return tryResolveAccusation(s, ctx);
      if (s.phase === 'final') return tryResolveFinal(s, ctx, !!s.finalDeadline && ctx.now >= s.finalDeadline);
      return s;
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

function SecretCard({ s, me }: { s: S; me: Member }) {
  const [open, setOpen] = useState(true);
  const spy = me.id === s.spy;
  const loc = SPYFALL[s.loc];
  return (
    <button
      className="card"
      style={{ '--cc': spy ? '#ff2e88' : '#19e3ff', width: '100%', cursor: 'pointer', minHeight: 150 } as CSSProperties}
      onClick={() => {
        sfx.card();
        setOpen((o) => !o);
      }}
    >
      <div className="card-kicker">{open ? 'Antippen zum Verdecken' : 'Antippen zum Aufdecken'}</div>
      {!open ? (
        <div className="card-emoji">🂠</div>
      ) : spy ? (
        <>
          <div className="card-emoji">🕶️</div>
          <div className="card-text pixel" style={{ fontSize: 16, color: 'var(--pink)' }}>
            DU BIST DER SPION
          </div>
          <div className="small">Finde raus, wo ihr seid – ohne aufzufliegen!</div>
        </>
      ) : (
        <>
          <div className="card-emoji">{loc.emoji}</div>
          <div className="card-text pixel" style={{ fontSize: 16, color: 'var(--yellow)' }}>
            {loc.ort}
          </div>
          <div>
            Deine Rolle: <b>{s.roles[me.id]}</b>
          </div>
        </>
      )}
    </button>
  );
}

function LocationList({ round, onGuess }: { round: number; onGuess?: (i: number) => void }) {
  const [crossed, setCrossed] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<number | null>(null);
  useEffect(() => setCrossed([]), [round]);
  return (
    <>
      <div className="grid2">
        {SPYFALL.map((l, i) => {
          const x = crossed.includes(i);
          return (
            <button
              key={l.ort}
              className="chip"
              style={{ opacity: x ? 0.35 : 1, textDecoration: x ? 'line-through' : undefined, justifyContent: 'flex-start' }}
              onClick={() => {
                sfx.click();
                if (onGuess) setConfirm(i);
                else setCrossed((c) => (x ? c.filter((y) => y !== i) : [...c, i]));
              }}
            >
              <span>{l.emoji}</span>
              <span className="small">{l.ort}</span>
            </button>
          );
        })}
      </div>
      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title="Sicher?">
        {confirm !== null && (
          <>
            <p className="center">
              Ihr seid in: <b>{SPYFALL[confirm].emoji} {SPYFALL[confirm].ort}</b>?
            </p>
            <p className="small muted center">Falsch geraten = du verlierst sofort!</p>
            <Button color="pink" block big onClick={() => (onGuess?.(confirm), setConfirm(null))}>
              Ja, das ist der Ort!
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [confetti, setConfetti] = useState(0);
  const [mode, setMode] = useState<'none' | 'accuse' | 'guess'>('none');
  const m = (id: string) => asMember(id, s, players);
  const pres = new Set(players.map((p) => p.id));
  const inGame = s.participants.includes(me.id) && s.phase !== 'setup';
  const iAmSpy = me.id === s.spy;

  useEffect(() => setMode('none'), [s.phase, s.round]);
  useEffect(() => {
    if (s.phase === 'accuse') {
      sfx.drumroll(1);
      buzz([60, 60, 60]);
    }
    if (s.phase === 'final') sfx.buzzer();
    if (s.phase === 'result' && s.result) {
      const won = inGame && (s.result.winner === 'spy') === iAmSpy;
      if (won) {
        sfx.fanfare();
        setConfetti(Date.now());
      } else sfx.fail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);

  if (s.phase === 'setup') {
    return (
      <div className="col">
        <BigTitle>📍 SPYFALL</BigTitle>
        <Panel>
          <p className="small">
            Alle kennen den Ort – nur der Spion nicht. Stellt euch reihum Fragen („Wie bist du heute hergekommen?“) und entlarvt den Spion, bevor er draufkommt, wo ihr
            seid!
          </p>
        </Panel>
        <h3>Rundenzeit</h3>
        {isHost ? (
          <Seg options={MINUTES.map((x) => ({ value: x, label: `${x} min` }))} value={s.opts.minutes} onChange={(v) => send({ type: 'opts', minutes: v })} />
        ) : (
          <p className="center">{s.opts.minutes} Minuten · 1 Spion</p>
        )}
        <div className="row wrap">
          {players.map((p) => (
            <MemberChip key={p.id} m={p} />
          ))}
        </div>
        {Object.keys(s.scores).length > 0 && <Scoreboard players={Object.keys(s.scores).map(m)} scores={s.scores} />}
        <HostButton isHost={isHost} onClick={() => send({ type: 'start' })} waitText="Der Host startet gleich die Runde …">
          Runde starten ▶
        </HostButton>
      </div>
    );
  }

  if (!inGame && s.phase !== 'result') {
    return (
      <div className="col">
        <BigTitle color="var(--cyan)">👀 Du schaust zu</BigTitle>
        <p className="center">Die Runde läuft – in der nächsten bist du dabei!</p>
        {s.phase === 'play' && <Countdown deadline={s.deadline} total={s.total} />}
      </div>
    );
  }

  if (s.phase === 'play') {
    const canAccuse = !s.usedAccuse.includes(me.id);
    return (
      <div className="col">
        <Countdown deadline={s.deadline} total={s.total} />
        <SecretCard s={s} me={me} />
        <Panel>
          <div className="row">
            <span style={{ fontSize: 26 }}>🎤</span>
            <span className="grow">
              <b style={{ color: m(s.starter).color }}>{m(s.starter).name}</b> stellt die erste Frage. Wer gefragt wurde, fragt als Nächstes (nicht zurück!).
            </span>
          </div>
        </Panel>

        {mode === 'accuse' ? (
          <>
            <h3 className="center">Wen verdächtigst du?</h3>
            <VoteGrid players={s.participants.filter((id) => pres.has(id)).map(m)} exclude={[me.id]} onVote={(id) => send({ type: 'accuse', target: id })} />
            <Button color="ghost" block onClick={() => setMode('none')}>
              Abbrechen
            </Button>
          </>
        ) : mode === 'guess' ? (
          <>
            <h3 className="center">Wo seid ihr? Tipp den Ort an:</h3>
            <LocationList round={s.round} onGuess={(i) => send({ type: 'spyGuess', loc: i })} />
            <Button color="ghost" block onClick={() => setMode('none')}>
              Abbrechen
            </Button>
          </>
        ) : (
          <>
            {iAmSpy && (
              <Button color="pink" block big onClick={() => setMode('guess')}>
                🕶️ Ich kenne den Ort!
              </Button>
            )}
            <Button color="yellow" block disabled={!canAccuse} onClick={() => setMode('accuse')}>
              {canAccuse ? '🚨 Verdacht melden' : '🚨 Verdacht schon verbraucht'}
            </Button>
            <h3>Mögliche Orte {iAmSpy ? '(zum Abhaken)' : ''}</h3>
            <LocationList round={s.round} />
            {isHost && (
              <Button color="ghost" small onClick={() => send({ type: 'endTime' })}>
                ⏩ Zeit beenden → Schlussabstimmung
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  if (s.phase === 'accuse' && s.accusation) {
    const acc = s.accusation;
    const voters = s.participants.filter((id) => id !== acc.target && pres.has(id));
    const mine = acc.votes[me.id];
    return (
      <div className="col">
        <BigTitle color="var(--pink)">🚨 VERDACHT!</BigTitle>
        <p className="center">
          <b>{m(acc.by).name}</b> beschuldigt:
        </p>
        <BigTitle color={m(acc.target).color}>
          {m(acc.target).avatar} {m(acc.target).name}
        </BigTitle>
        <p className="center small">Nur wenn ALLE anderen zustimmen, wird enthüllt. Die Uhr steht so lange.</p>
        {me.id === acc.target ? (
          <p className="center">Du stehst am Pranger! Verteidige dich – laut! 🗣️</p>
        ) : mine === undefined ? (
          <div className="grid2">
            <Button color="green" big onClick={() => send({ type: 'accuseVote', yes: true })}>
              👍 Ja, Spion!
            </Button>
            <Button color="red" big onClick={() => send({ type: 'accuseVote', yes: false })}>
              👎 Nein
            </Button>
          </div>
        ) : (
          <p className="center">Du hast {mine ? '👍 Ja' : '👎 Nein'} gesagt.</p>
        )}
        <WaitingFor players={voters.map(m)} done={Object.keys(acc.votes)} />
        {iAmSpy && (
          <>
            <h3 className="center">Schnell – Ort raten?</h3>
            <LocationList round={s.round} onGuess={(i) => send({ type: 'spyGuess', loc: i })} />
          </>
        )}
      </div>
    );
  }

  if (s.phase === 'final') {
    const voters = s.participants.filter((id) => pres.has(id));
    return (
      <div className="col">
        <BigTitle color="var(--pink)">⏰ ZEIT IS!</BigTitle>
        <p className="center">Schlussabstimmung: Wer ist der Spion? Die Mehrheit entscheidet.</p>
        <Countdown deadline={s.finalDeadline} total={FINAL_SECS} />
        {!s.finalVotes[me.id] ? (
          <VoteGrid players={s.participants.map(m)} exclude={[me.id]} onVote={(id) => send({ type: 'finalVote', target: id })} />
        ) : (
          <p className="center">Stimme abgegeben 🤐</p>
        )}
        <WaitingFor players={voters.map(m)} done={Object.keys(s.finalVotes)} />
      </div>
    );
  }

  // result
  const r = s.result ?? { winner: 'spy', reason: 'finalMissed' };
  const loc = SPYFALL[s.loc];
  const spyM = m(s.spy);
  const reasonText: Record<Result['reason'], string> = {
    caught: `Einstimmig enttarnt! ${spyM.name} war der Spion. 🎯`,
    framed: `Ihr habt einstimmig ${r.accused ? m(r.accused).name : 'jemanden'} beschuldigt – unschuldig! Der Spion lacht sich ins Fäustchen.`,
    guessRight: `Der Spion hat den Ort erraten! 🕶️`,
    guessWrong: `Der Spion hat auf ${r.guess !== undefined ? SPYFALL[r.guess]?.ort : '?'} getippt – voll daneben! 😂`,
    finalCaught: `Schlussabstimmung: ${spyM.name} erwischt! 🎯`,
    finalMissed: r.accused ? `Schlussabstimmung: ${m(r.accused).name} gewählt – falsch!` : 'Schlussabstimmung: keine Mehrheit – der Spion entkommt!',
    spyLeft: 'Der Spion hat sich verdrückt.',
  };
  const spyWon = r.winner === 'spy';
  return (
    <div className="col">
      <Confetti fire={confetti} />
      <BigTitle color={spyWon ? 'var(--pink)' : 'var(--green)'}>{spyWon ? '🕶️ DER SPION GEWINNT!' : '🎉 DIE BÜRGER GEWINNEN!'}</BigTitle>
      <p className="center">{reasonText[r.reason]}</p>
      <Panel glow="cyan">
        <div className="row between">
          <span>Ort</span>
          <b style={{ color: 'var(--yellow)' }}>
            {loc.emoji} {loc.ort}
          </b>
        </div>
        <div className="row between">
          <span>Spion</span>
          <MemberChip m={spyM} />
        </div>
      </Panel>
      <div className="col" style={{ gap: 6 }}>
        {s.participants
          .filter((id) => id !== s.spy)
          .map((id) => (
            <div className="score-row" key={id}>
              <MemberChip m={m(id)} />
              <span className="grow" />
              <span className="small">{s.roles[id]}</span>
            </div>
          ))}
      </div>
      <Panel glow="pink">
        <p className="center">{spyWon ? fill('🍺 Alle Bürger trinken {s:2}!') : fill(`🍺 ${spyM.name} trinkt {s:3}!`)}</p>
      </Panel>
      <Scoreboard players={Object.keys(s.scores).map(m)} scores={s.scores} title="Punkte (Spion 2–4, Bürger 1)" />
      <HostButton isHost={isHost} onClick={() => send({ type: 'start' })}>
        Nächste Runde ▶
      </HostButton>
      {isHost && (
        <Button color="ghost" small onClick={() => send({ type: 'next' })}>
          ⚙️ Rundenzeit ändern
        </Button>
      )}
    </div>
  );
}

export const spyfall: OnlineGameDef<S, A> = {
  id: 'spyfall',
  name: 'Spyfall',
  emoji: '📍',
  tagline: 'Einer weiß nicht, wo ihr seid',
  color: '#19e3ff',
  minPlayers: 3,
  rules: [
    'Alle sehen am Handy denselben Ort und eine eigene Rolle – nur der Spion sieht „DU BIST DER SPION“.',
    'Reihum stellt man einer Person eine Frage zum Ort. Die Bürger wollen den Spion entlarven, ohne den Ort zu verraten.',
    'Jeder darf einmal pro Runde „Verdacht melden“: Stimmen ALLE anderen zu, wird enthüllt. Unschuldig erwischt = Spion gewinnt.',
    'Der Spion kann jederzeit „Ich kenne den Ort!“ drücken. Richtig = Sieg, falsch = Niederlage.',
    'Läuft die Zeit ab, wählt jeder, wer der Spion ist – die Mehrheit entscheidet.',
    'Punkte: Spion 2 (4 bei erratenem Ort oder Falschbeschuldigung), jeder Bürger 1. Verlierer trinken.',
  ],
  init: () => ({
    phase: 'setup',
    opts: { minutes: 8 },
    round: 0,
    loc: 0,
    spy: '',
    roles: {},
    info: {},
    participants: [],
    starter: '',
    deadline: 0,
    total: 0,
    paused: null,
    accusation: null,
    usedAccuse: [],
    finalVotes: {},
    finalDeadline: null,
    result: null,
    spyGoneSince: null,
    scores: {},
  }),
  reduce,
  View,
};
