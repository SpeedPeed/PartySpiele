import { useState, type CSSProperties } from 'react';
import { Panel } from '../../components/ui';
import { QUIZ } from '../../data/quiz';
import type { QuizQuestion } from '../../data/types';
import { shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { Countdown, HostButton, MemberChip, Scoreboard, WaitingFor } from '../kit';
import type { OnlineGameDef, OnlineViewProps } from '../types';
import { FinalScreen, OptionRow, RoundHeader, SetupScreen, addScores, allDone, useOnChange, useTickingSeconds } from './shared';

const SECONDS = 15;
const ALL = 'Alle';
const CATS = [ALL, ...Array.from(new Set(QUIZ.map((q) => q.cat)))];

/** Kahoot-artige Farben + Formen. */
const ANSWER_STYLE = [
  { bg: '#e21b3c', shape: '▲' },
  { bg: '#1368ce', shape: '◆' },
  { bg: '#d89e00', shape: '●' },
  { bg: '#26890c', shape: '■' },
];

interface Answer {
  c: number;
  ms: number;
}

interface S {
  phase: 'setup' | 'question' | 'reveal' | 'final';
  count: number;
  cat: string;
  qs: QuizQuestion[];
  idx: number;
  startedAt: number;
  deadline: number;
  answers: Record<string, Answer>;
  gained: Record<string, number>;
  scores: Record<string, number>;
}

type A = { type: 'start'; count: number; cat: string } | { type: 'answer'; c: number } | { type: 'next' } | { type: 'again' };

function quizPoints(ms: number): number {
  const f = Math.min(1, Math.max(0, ms / (SECONDS * 1000)));
  return Math.round((1000 - 500 * f) / 10) * 10;
}

function reveal(s: S): S {
  const q = s.qs[s.idx];
  const gained: Record<string, number> = {};
  for (const [id, a] of Object.entries(s.answers)) if (a.c === q.c) gained[id] = quizPoints(a.ms);
  return { ...s, phase: 'reveal', gained, scores: addScores(s.scores, gained) };
}

function ask(s: S, idx: number, now: number): S {
  return { ...s, phase: 'question', idx, answers: {}, gained: {}, startedAt: now, deadline: now + SECONDS * 1000 };
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [count, setCount] = useState(s.count);
  const [cat, setCat] = useState(s.cat);
  const q = s.qs[s.idx];
  const mine = s.answers[me.id];
  const left = useTickingSeconds(s.phase === 'question' ? s.deadline : null);

  useOnChange(s.phase + s.idx, () => {
    if (s.phase !== 'reveal') return;
    if (s.gained[me.id]) {
      sfx.success();
      buzz(40);
    } else {
      sfx.fail();
      buzz([80, 40, 80]);
    }
  });

  if (s.phase === 'setup')
    return (
      <SetupScreen
        isHost={isHost}
        emoji="🧠"
        title="Quiz-Duell"
        players={players}
        intro={<>Alle sehen dieselbe Frage. Wer schneller richtig drückt, kriegt mehr Punkte (1000 → 500). Falsch oder zu langsam: {fill('{s:1}')}!</>}
        onStart={() => send({ type: 'start', count, cat })}
      >
        <OptionRow label="Fragen" value={count} onChange={setCount} options={[10, 15, 20].map((n) => ({ value: n, label: String(n) }))} />
        <OptionRow label="Kategorie" value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c }))} />
      </SetupScreen>
    );

  if (s.phase === 'final') return <FinalScreen players={players} scores={s.scores} me={me} isHost={isHost} fill={fill} onAgain={() => send({ type: 'again' })} title="Quiz-König" />;

  const answeredIds = Object.keys(s.answers);

  if (s.phase === 'question')
    return (
      <div className="col">
        <RoundHeader round={s.idx + 1} total={s.qs.length} label={`${q.cat} · Frage`} />
        <Countdown deadline={s.deadline} total={SECONDS} />
        <Panel glow="cyan">
          <div style={{ fontSize: q.q.length > 90 ? 24 : 28, lineHeight: 1.15 }}>{q.q}</div>
        </Panel>
        <div className="grid2">
          {q.a.map((txt, i) => (
            <AnswerButton key={s.idx + '-' + i} i={i} text={txt} disabled={!!mine || left <= 0} chosen={mine?.c === i} dim={!!mine && mine.c !== i} onClick={() => send({ type: 'answer', c: i })} />
          ))}
        </div>
        {mine ? <p className="center">Eingeloggt! 🔒 Daumen drücken …</p> : null}
        <WaitingFor players={players} done={answeredIds} />
      </div>
    );

  // reveal
  const correct = q.c;
  const myGain = s.gained[me.id] ?? 0;
  return (
    <div className="col">
      <RoundHeader round={s.idx + 1} total={s.qs.length} label="Auflösung" />
      <Panel>
        <div style={{ fontSize: 24, lineHeight: 1.15 }}>{q.q}</div>
      </Panel>
      {myGain > 0 ? (
        <div className="ok-notice center">
          ✔ Richtig! <b>+{myGain}</b> Punkte – leiwand!
        </div>
      ) : (
        <div className="notice center shake">✘ {mine ? 'Falsch' : 'Keine Antwort'}! Oida … {fill('{s:1}')}!</div>
      )}
      <div className="col" style={{ gap: 8 }}>
        {q.a.map((txt, i) => {
          const who = players.filter((p) => s.answers[p.id]?.c === i);
          return (
            <div key={i} style={{ ...answerBox(i), opacity: i === correct ? 1 : 0.55, minHeight: 0, padding: '10px 12px', outline: i === correct ? '4px solid var(--green)' : undefined } as CSSProperties}>
              <div className="row between">
                <span>
                  {ANSWER_STYLE[i].shape} {txt}
                </span>
                <span>{i === correct ? '✔' : ''}</span>
              </div>
              {who.length > 0 && (
                <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                  {who.map((p) => (
                    <MemberChip key={p.id} m={p} extra={s.gained[p.id] ? <span className="small">+{s.gained[p.id]}</span> : null} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Scoreboard players={players} scores={s.scores} title="Rangliste" />
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        {s.idx + 1 >= s.qs.length ? '🏁 Zum Finale' : 'Nächste Frage ▶'}
      </HostButton>
    </div>
  );
}

function answerBox(i: number): CSSProperties {
  return {
    background: ANSWER_STYLE[i].bg,
    color: '#fff',
    border: 'none',
    fontFamily: 'var(--body)',
    fontSize: 24,
    lineHeight: 1.1,
    textAlign: 'left',
    textShadow: '2px 2px 0 rgba(0,0,0,.45)',
    boxShadow: 'inset -4px -4px 0 rgba(0,0,0,.35), inset 4px 4px 0 rgba(255,255,255,.25), 0 0 0 3px var(--shadow), 0 6px 0 3px var(--shadow)',
    minHeight: 110,
    padding: 12,
  };
}

function AnswerButton({ i, text, onClick, disabled, chosen, dim }: { i: number; text: string; onClick: () => void; disabled: boolean; chosen: boolean; dim: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => {
        sfx.select();
        buzz(25);
        onClick();
      }}
      style={{
        ...answerBox(i),
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-start',
        cursor: disabled ? 'default' : 'pointer',
        opacity: dim ? 0.35 : 1,
        outline: chosen ? '4px solid var(--yellow)' : undefined,
        transform: chosen ? 'translateY(4px)' : undefined,
      }}
    >
      <span className="pixel" style={{ fontSize: 18 }}>
        {ANSWER_STYLE[i].shape}
      </span>
      <span>{text}</span>
    </button>
  );
}

export const quiz: OnlineGameDef<S, A> = {
  id: 'quiz',
  name: 'Quiz-Duell',
  emoji: '🧠',
  tagline: 'Kahoot-Style: wer drückt am schnellsten?',
  color: '#19e3ff',
  minPlayers: 2,
  rules: [
    'Alle bekommen dieselbe Frage mit 4 Antworten aufs Handy – 15 Sekunden Zeit.',
    'Richtig = 1000 Punkte, je langsamer desto weniger (mindestens 500).',
    'Falsch oder keine Antwort: 1 Schluck.',
    'Am Ende: der Quiz-König wird gefeiert, der Letzte trinkt 3.',
  ],
  init: () => ({ phase: 'setup', count: 10, cat: ALL, qs: [], idx: 0, startedAt: 0, deadline: 0, answers: {}, gained: {}, scores: {} }),
  reduce(s, a, ctx) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'setup') return s;
        const count = [10, 15, 20].includes(a.count) ? a.count : 10;
        const cat = CATS.includes(a.cat) ? a.cat : ALL;
        const pool = cat === ALL ? QUIZ : QUIZ.filter((q) => q.cat === cat);
        const qs = shuffle(pool).slice(0, count);
        if (!qs.length) return s;
        return ask({ ...s, count, cat, qs, scores: {} }, 0, ctx.now);
      }
      case 'answer': {
        if (s.phase !== 'question' || s.answers[a.from] || ctx.now > s.deadline + 500) return s;
        if (!(a.c >= 0 && a.c <= 3)) return s;
        const answers = { ...s.answers, [a.from]: { c: a.c, ms: Math.max(0, ctx.now - s.startedAt) } };
        const next = { ...s, answers };
        return allDone(ctx.players, Object.keys(answers)) ? reveal(next) : next;
      }
      case 'tick':
        if (s.phase === 'question' && (ctx.now >= s.deadline || allDone(ctx.players, Object.keys(s.answers)))) return reveal(s);
        return s;
      case 'next':
        if (s.phase !== 'reveal') return s;
        if (s.idx + 1 >= s.qs.length) return { ...s, phase: 'final' };
        return ask(s, s.idx + 1, ctx.now);
      case 'again':
        if (s.phase !== 'final') return s;
        return { ...s, phase: 'setup', qs: [], idx: 0, answers: {}, gained: {}, scores: {} };
    }
    return s;
  },
  View,
};
