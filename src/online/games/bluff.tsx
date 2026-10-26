import { useState, type CSSProperties } from 'react';
import { Panel } from '../../components/ui';
import { BLUFF } from '../../data/bluff';
import type { BluffFact } from '../../data/types';
import { shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, MemberChip, Scoreboard, TextAnswer, WaitingFor } from '../kit';
import type { OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';
import { FinalScreen, OptionRow, SetupScreen, addScores, allDone, levenshtein, normalize, useOnChange, useTickingSeconds } from './shared';

const WRITE_SECONDS = 60;
const PICK_SECONDS = 30;
const TRUTH_POINTS = 1000;
const FOOL_POINTS = 500;

interface Option {
  text: string;
  /** Autoren dieser Lüge (zusammengefasste Duplikate). Leer bei der Wahrheit. */
  authors: string[];
  truth: boolean;
}

interface S {
  phase: 'setup' | 'write' | 'pick' | 'reveal' | 'final';
  rounds: number;
  round: number;
  qs: BluffFact[];
  deadline: number;
  lies: Record<string, string>;
  /** Wie oft jemand "zu nah an der Wahrheit" war (Zähler, damit der Hinweis neu aufblinkt). */
  tooClose: Record<string, number>;
  options: Option[];
  picks: Record<string, number>;
  gained: Record<string, number>;
  scores: Record<string, number>;
}

type A = { type: 'start'; rounds: number } | { type: 'lie'; text: string } | { type: 'pick'; i: number } | { type: 'next' } | { type: 'again' };

/** Ist die Lüge (fast) die Wahrheit? */
function tooCloseToTruth(lie: string, truth: string): boolean {
  const l = normalize(lie);
  const t = normalize(truth);
  if (!l || !t) return false;
  if (l === t) return true;
  if (t.length > 5 && levenshtein(l, t) <= 1) return true;
  // "Kaiser Franz Joseph" vs "Franz Joseph"
  if (t.length >= 4 && l.includes(t)) return true;
  if (l.length >= 5 && t.includes(l) && l.length / t.length >= 0.6) return true;
  return false;
}

function round(s: BluffFact[], i: number): BluffFact {
  return s[Math.min(i, s.length - 1)];
}

function startRound(s: S, ctx: OnlineCtx, r: number): S {
  return { ...s, phase: 'write', round: r, deadline: ctx.now + WRITE_SECONDS * 1000, lies: {}, tooClose: {}, options: [], picks: {}, gained: {} };
}

function toPick(s: S, ctx: OnlineCtx): S {
  const q = round(s.qs, s.round - 1);
  const byKey = new Map<string, Option>();
  for (const [id, text] of Object.entries(s.lies)) {
    const k = normalize(text) || text;
    const o = byKey.get(k);
    if (o) o.authors.push(id);
    else byKey.set(k, { text, authors: [id], truth: false });
  }
  const options = shuffle([...byKey.values(), { text: q.a, authors: [], truth: true }]);
  return { ...s, phase: 'pick', options, picks: {}, deadline: ctx.now + PICK_SECONDS * 1000 };
}

/** Wer kann wählen? Jeder mit mindestens einer fremden Option (die Wahrheit gibt’s immer). */
function pickDone(s: S, ctx: OnlineCtx): boolean {
  return allDone(ctx.players, Object.keys(s.picks));
}

function reveal(s: S): S {
  const gained: Record<string, number> = {};
  for (const [id, i] of Object.entries(s.picks)) {
    const o = s.options[i];
    if (!o) continue;
    if (o.truth) gained[id] = (gained[id] ?? 0) + TRUTH_POINTS;
    else for (const a of o.authors) if (a !== id) gained[a] = (gained[a] ?? 0) + FOOL_POINTS;
  }
  return { ...s, phase: 'reveal', gained, scores: addScores(s.scores, gained) };
}

/** Frage mit hervorgehobener Lücke. */
function Question({ q, fill }: { q: string; fill?: string }) {
  const parts = q.split(/_{2,}/);
  return (
    <div style={{ fontSize: q.length > 110 ? 23 : 27, lineHeight: 1.2 }}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <span style={{ color: 'var(--yellow)', borderBottom: '3px dashed var(--yellow)', padding: '0 4px' }}>{fill ?? ' ? ? ? '}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [rounds, setRounds] = useState(s.rounds);
  useTickingSeconds(s.phase === 'write' || s.phase === 'pick' ? s.deadline : null);

  useOnChange(s.phase + s.round, () => {
    if (s.phase !== 'reveal') return;
    const myPick = s.options[s.picks[me.id]];
    if (myPick?.truth) sfx.success();
    else if (myPick) {
      sfx.fail();
      buzz([80, 40, 80]);
    }
    if (s.gained[me.id]) setTimeout(() => sfx.coin(), 500);
  });

  const tc = s.tooClose[me.id] ?? 0;
  useOnChange(String(tc), () => {
    if (tc) {
      sfx.buzzer();
      buzz([100, 50, 100]);
    }
  });

  if (s.phase === 'setup')
    return (
      <SetupScreen
        isHost={isHost}
        emoji="🤥"
        title="Bluff"
        players={players}
        intro={
          <>
            Eine kuriose Frage mit Lücke. Erfinde eine glaubwürdige <b>falsche</b> Antwort! Dann sucht jeder die echte. Wahrheit gefunden: +{TRUTH_POINTS}. Jeder, der auf deine Lüge reinfällt: +{FOOL_POINTS}. Reingefallen: {fill('{s:1}')}!
          </>
        }
        onStart={() => send({ type: 'start', rounds })}
      >
        <OptionRow label="Runden" value={rounds} onChange={setRounds} options={[5, 7].map((n) => ({ value: n, label: String(n) }))} />
      </SetupScreen>
    );

  if (s.phase === 'final') return <FinalScreen players={players} scores={s.scores} me={me} isHost={isHost} fill={fill} onAgain={() => send({ type: 'again' })} title="Bluff-Meister" />;

  const q = round(s.qs, s.round - 1);
  const head = (
    <Panel glow="pink">
      <div className="pixel" style={{ fontSize: 9, color: 'var(--pink)', marginBottom: 6 }}>
        RUNDE {s.round}/{s.rounds}
      </div>
      <Question q={q.q} fill={s.phase === 'reveal' ? q.a : undefined} />
    </Panel>
  );

  if (s.phase === 'write') {
    const mine = s.lies[me.id];
    return (
      <div className="col">
        <Countdown deadline={s.deadline} total={WRITE_SECONDS} />
        {head}
        {mine === undefined ? (
          <>
            {tc > 0 && (
              <div className="notice center shake" key={tc}>
                🙊 Zu nah an der Wahrheit! Du kennst sie wohl – denk dir eine neue Antwort aus.
              </div>
            )}
            <p className="center muted small">Schreib eine Lüge, die echt klingt 🤥</p>
            <TextAnswer key={tc} maxLength={50} placeholder="Deine Lüge …" onSubmit={(t) => (sfx.select(), send({ type: 'lie', text: t }))} />
          </>
        ) : (
          <Panel>
            <div className="muted small">Deine Lüge:</div>
            <div style={{ fontSize: 24 }}>„{mine}“ 😏</div>
          </Panel>
        )}
        <WaitingFor players={players} done={Object.keys(s.lies)} label="Die lügen noch" />
      </div>
    );
  }

  if (s.phase === 'pick') {
    const myPick = s.picks[me.id];
    return (
      <div className="col">
        <Countdown deadline={s.deadline} total={PICK_SECONDS} />
        {head}
        <h3 className="center">{myPick !== undefined ? 'Gewählt! 🔒' : 'Was ist die Wahrheit?'}</h3>
        <div className="col" style={{ gap: 10 }}>
          {s.options.map((o, i) => {
            const own = o.authors.includes(me.id);
            const sel = myPick === i;
            return (
              <button
                key={i}
                className="tile"
                disabled={own || myPick !== undefined}
                onClick={() => {
                  sfx.select();
                  buzz(25);
                  send({ type: 'pick', i });
                }}
                style={
                  {
                    '--tc': sel ? 'var(--yellow)' : own ? 'var(--muted)' : 'var(--pink)',
                    minHeight: 60,
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    fontSize: 24,
                    color: 'var(--ink)',
                    opacity: own ? 0.45 : myPick !== undefined && !sel ? 0.6 : 1,
                    outline: sel ? '4px solid var(--yellow)' : undefined,
                  } as CSSProperties
                }
              >
                {o.text}
                {own && <span className="muted small"> (deine Lüge)</span>}
              </button>
            );
          })}
        </div>
        <WaitingFor players={players} done={Object.keys(s.picks)} />
      </div>
    );
  }

  // reveal
  const member = (id: string) => players.find((p) => p.id === id);
  const myPick = s.options[s.picks[me.id]];
  const fooled = players.filter((p) => {
    const o = s.options[s.picks[p.id]];
    return o && !o.truth;
  });
  const truthIdx = s.options.findIndex((o) => o.truth);
  const sorted = s.options.map((o, i) => ({ o, i })).sort((a, b) => (a.o.truth ? -1 : b.o.truth ? 1 : 0));
  return (
    <div className="col">
      {head}
      <BigTitle color="var(--green)">✔ {q.a}</BigTitle>
      {myPick?.truth && <div className="ok-notice center">Richtig erkannt! +{TRUTH_POINTS} 🕵️</div>}
      {myPick && !myPick.truth && (
        <div className="notice center shake">
          Reingefallen! 🤡 {fill('{s:1}')}
          {myPick.authors.length ? ` – die Lüge war von ${myPick.authors.map((a) => member(a)?.name ?? '?').join(' & ')}` : ''}
        </div>
      )}
      <div className="col" style={{ gap: 10 }}>
        {sorted.map(({ o, i }) => {
          const pickers = players.filter((p) => s.picks[p.id] === i);
          return (
            <Panel key={i} glow={o.truth ? 'cyan' : undefined} style={{ opacity: !o.truth && !pickers.length ? 0.6 : 1 }}>
              <div className="row between">
                <span style={{ fontSize: 24 }}>{o.text}</span>
                <span>{o.truth ? '✔ WAHR' : '🤥'}</span>
              </div>
              {!o.truth && (
                <div className="row wrap small" style={{ marginTop: 4 }}>
                  <span className="muted">Lüge von:</span>
                  {o.authors.map((a) => {
                    const m = member(a);
                    return m ? <MemberChip key={a} m={m} extra={s.gained[a] ? <span className="small">+{s.gained[a]}</span> : null} /> : <span key={a}>👻</span>;
                  })}
                </div>
              )}
              {pickers.length > 0 && <div className="small muted" style={{ marginTop: 4 }}>{o.truth ? '🕵️ Erkannt: ' : '🤡 Reingefallen: '}{pickers.map((p) => p.avatar + ' ' + p.name).join(', ')}</div>}
            </Panel>
          );
        })}
      </div>
      {fooled.length > 0 && truthIdx >= 0 && (
        <p className="center">
          Alle Reingefallenen ({fooled.map((f) => f.name).join(', ')}): {fill('{s:1}')}! 🍺
        </p>
      )}
      <Scoreboard players={players} scores={s.scores} />
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        {s.round >= s.rounds ? '🏁 Zum Finale' : 'Nächste Frage ▶'}
      </HostButton>
    </div>
  );
}

export const bluff: OnlineGameDef<S, A> = {
  id: 'bluff',
  name: 'Bluff',
  emoji: '🤥',
  tagline: 'Lüg so gut, dass alle reinfallen',
  color: '#ff2e88',
  minPlayers: 3,
  rules: [
    'Eine kuriose Frage mit Lücke erscheint – jeder schreibt eine glaubwürdige FALSCHE Antwort.',
    'Dann werden alle Lügen und die Wahrheit gemischt gezeigt. Jeder tippt auf die, die er für wahr hält (nicht die eigene).',
    'Wahrheit gefunden: +1000. Für jeden, der auf deine Lüge reinfällt: +500.',
    'Wer auf eine Lüge reinfällt: 1 Schluck.',
  ],
  init: () => ({ phase: 'setup', rounds: 5, round: 0, qs: [], deadline: 0, lies: {}, tooClose: {}, options: [], picks: {}, gained: {}, scores: {} }),
  reduce(s, a, ctx) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'setup') return s;
        const rounds = a.rounds === 7 ? 7 : 5;
        const qs = shuffle(BLUFF).slice(0, rounds);
        if (!qs.length) return s;
        return startRound({ ...s, rounds: qs.length, qs, scores: {} }, ctx, 1);
      }
      case 'lie': {
        if (s.phase !== 'write' || s.lies[a.from] !== undefined) return s;
        const text = String(a.text ?? '').trim().slice(0, 50);
        if (!text) return s;
        const q = round(s.qs, s.round - 1);
        if (tooCloseToTruth(text, q.a)) return { ...s, tooClose: { ...s.tooClose, [a.from]: (s.tooClose[a.from] ?? 0) + 1 } };
        const next = { ...s, lies: { ...s.lies, [a.from]: text } };
        return allDone(ctx.players, Object.keys(next.lies)) ? toPick(next, ctx) : next;
      }
      case 'pick': {
        if (s.phase !== 'pick' || s.picks[a.from] !== undefined) return s;
        const o = s.options[a.i];
        if (!o || o.authors.includes(a.from)) return s;
        const next = { ...s, picks: { ...s.picks, [a.from]: a.i } };
        return pickDone(next, ctx) ? reveal(next) : next;
      }
      case 'tick':
        if (s.phase === 'write' && (ctx.now >= s.deadline || allDone(ctx.players, Object.keys(s.lies)))) return toPick(s, ctx);
        if (s.phase === 'pick' && (ctx.now >= s.deadline || pickDone(s, ctx))) return reveal(s);
        return s;
      case 'next':
        if (s.phase !== 'reveal') return s;
        if (s.round >= s.rounds) return { ...s, phase: 'final' };
        return startRound(s, ctx, s.round + 1);
      case 'again':
        if (s.phase !== 'final') return s;
        return { ...s, phase: 'setup', round: 0, qs: [], scores: {}, gained: {} };
    }
    return s;
  },
  View,
};
