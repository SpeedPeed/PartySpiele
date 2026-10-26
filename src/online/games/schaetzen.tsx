import { useState } from 'react';
import { Panel } from '../../components/ui';
import { SCHAETZFRAGEN } from '../../data/schaetzen';
import type { EstimateQuestion } from '../../data/types';
import { shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, Scoreboard, TextAnswer, WaitingFor } from '../kit';
import type { OnlineGameDef, OnlineViewProps } from '../types';
import { FinalScreen, OptionRow, RoundHeader, SetupScreen, addScores, allDone, fmtNum, parseNumber, useOnChange, useTickingSeconds } from './shared';

const SECONDS = 30;

interface Result {
  id: string;
  v: number;
  diff: number;
}

interface S {
  phase: 'setup' | 'answer' | 'reveal' | 'final';
  rounds: number;
  qs: EstimateQuestion[];
  idx: number;
  deadline: number;
  answers: Record<string, number>;
  results: Result[];
  gained: Record<string, number>;
  farthest: string[];
  scores: Record<string, number>;
}

type A = { type: 'start'; rounds: number } | { type: 'answer'; v: number } | { type: 'next' } | { type: 'again' };

function reveal(s: S): S {
  const q = s.qs[s.idx];
  const results: Result[] = Object.entries(s.answers)
    .map(([id, v]) => ({ id, v, diff: Math.abs(v - q.a) }))
    .sort((a, b) => a.diff - b.diff);
  const gained: Record<string, number> = {};
  let farthest: string[] = [];
  if (results.length) {
    const best = results[0].diff;
    for (const r of results) if (r.diff === best) gained[r.id] = best === 0 ? 5 : 3;
    const worst = results[results.length - 1].diff;
    if (results.length > 1 && worst > best) farthest = results.filter((r) => r.diff === worst).map((r) => r.id);
  }
  return { ...s, phase: 'reveal', results, gained, farthest, scores: addScores(s.scores, gained) };
}

function ask(s: S, idx: number, now: number): S {
  return { ...s, phase: 'answer', idx, deadline: now + SECONDS * 1000, answers: {}, results: [], gained: {}, farthest: [] };
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [rounds, setRounds] = useState(s.rounds);
  const [err, setErr] = useState(false);
  const q = s.qs[s.idx];
  useTickingSeconds(s.phase === 'answer' ? s.deadline : null);

  useOnChange(s.phase + s.idx, () => {
    if (s.phase !== 'reveal') return;
    if (s.gained[me.id]) {
      sfx.coin();
      buzz(40);
    } else if (s.farthest.includes(me.id)) {
      sfx.fail();
      buzz([80, 40, 80]);
    } else sfx.card();
  });

  if (s.phase === 'setup')
    return (
      <SetupScreen
        isHost={isHost}
        emoji="📏"
        title="Schätzmeister"
        players={players}
        intro={
          <>
            Alle schätzen dieselbe Frage. Am nächsten dran: <b>3 Punkte</b> (exakt: <b>5</b>). Am weitesten daneben: {fill('{s:2}')}!
          </>
        }
        onStart={() => send({ type: 'start', rounds })}
      >
        <OptionRow label="Runden" value={rounds} onChange={setRounds} options={[8, 12].map((n) => ({ value: n, label: String(n) }))} />
      </SetupScreen>
    );

  if (s.phase === 'final') return <FinalScreen players={players} scores={s.scores} me={me} isHost={isHost} fill={fill} onAgain={() => send({ type: 'again' })} title="Schätzmeister" unit=" P" />;

  const unit = q.unit ? ' ' + q.unit : '';

  if (s.phase === 'answer') {
    const mine = s.answers[me.id];
    return (
      <div className="col">
        <RoundHeader round={s.idx + 1} total={s.qs.length} label="Frage" />
        <Countdown deadline={s.deadline} total={SECONDS} />
        <Panel glow="yellow">
          <div style={{ fontSize: 28, lineHeight: 1.15 }}>{q.q}</div>
          {q.unit && <div className="muted small">Einheit: {q.unit}</div>}
        </Panel>
        {mine === undefined ? (
          <>
            <TextAnswer
              numeric
              maxLength={20}
              placeholder={`Deine Schätzung${unit ? ' in' + unit : ''} …`}
              onSubmit={(v) => {
                const n = parseNumber(v);
                if (n === null) {
                  setErr(true);
                  sfx.fail();
                  return;
                }
                setErr(false);
                sfx.select();
                send({ type: 'answer', v: n });
              }}
            />
            {err && <div className="notice">Das ist keine Zahl, Oida! Nur Ziffern, Komma oder Punkt.</div>}
          </>
        ) : (
          <p className="center">
            Deine Schätzung: <b style={{ color: 'var(--yellow)' }}>{fmtNum(mine)}{unit}</b> 🔒
          </p>
        )}
        <WaitingFor players={players} done={Object.keys(s.answers)} />
      </div>
    );
  }

  // reveal
  const name = (id: string) => players.find((p) => p.id === id);
  const far = s.farthest.map((id) => name(id)?.name ?? '?');
  return (
    <div className="col">
      <RoundHeader round={s.idx + 1} total={s.qs.length} label="Auflösung" />
      <Panel>
        <div style={{ fontSize: 22, lineHeight: 1.15 }}>{q.q}</div>
      </Panel>
      <div className="center muted small">Richtige Antwort</div>
      <div className="big-num center" style={{ fontSize: 34 }}>
        {fmtNum(q.a)}
        <span style={{ fontSize: 16 }}>{unit}</span>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {s.results.map((r, i) => {
          const p = name(r.id);
          const pts = s.gained[r.id];
          const isFar = s.farthest.includes(r.id);
          return (
            <div className="score-row" key={r.id} style={{ outline: r.id === me.id ? '3px solid var(--cyan)' : undefined }}>
              <span className="rank">{pts ? (r.diff === 0 ? '🎯' : '🥇') : isFar ? '🍺' : `${i + 1}.`}</span>
              <span style={{ fontSize: 22 }}>{p?.avatar ?? '👻'}</span>
              <div className="grow">
                <div>{p?.name ?? 'Weg'}</div>
                <div className="muted small">
                  {fmtNum(r.v)}
                  {unit} · {r.diff === 0 ? 'EXAKT!' : `±${fmtNum(r.diff)}`}
                </div>
              </div>
              <span className="val">{pts ? `+${pts}` : isFar ? fill('{s:2}') : ''}</span>
            </div>
          );
        })}
        {!s.results.length && <p className="center muted">Keiner hat geschätzt … feig! 🐔</p>}
      </div>
      {far.length > 0 && <BigTitle color="var(--pink)">{far.join(' & ')}: {fill('{s:2}')}! 🍺</BigTitle>}
      {s.answers[me.id] === undefined && <div className="notice center">Nix geschätzt? Oida … {fill('{s:1}')}!</div>}
      <Scoreboard players={players} scores={s.scores} title="Punktestand" />
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        {s.idx + 1 >= s.qs.length ? '🏁 Zum Finale' : 'Nächste Frage ▶'}
      </HostButton>
    </div>
  );
}

export const schaetzen: OnlineGameDef<S, A> = {
  id: 'schaetzen',
  name: 'Schätzmeister',
  emoji: '📏',
  tagline: 'Wer liegt am nächsten dran?',
  color: '#ffe03a',
  minPlayers: 2,
  rules: [
    'Alle bekommen dieselbe Schätzfrage und tippen eine Zahl ein (Komma oder Punkt erlaubt) – 30 Sekunden.',
    'Wer am nächsten dran ist, bekommt 3 Punkte – exakt getroffen sogar 5.',
    'Wer am weitesten daneben liegt, trinkt 2.',
    'Nach allen Runden gewinnt der Schätzmeister, der Letzte trinkt 3.',
  ],
  init: () => ({ phase: 'setup', rounds: 8, qs: [], idx: 0, deadline: 0, answers: {}, results: [], gained: {}, farthest: [], scores: {} }),
  reduce(s, a, ctx) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'setup') return s;
        const rounds = a.rounds === 12 ? 12 : 8;
        const qs = shuffle(SCHAETZFRAGEN).slice(0, rounds);
        if (!qs.length) return s;
        return ask({ ...s, rounds, qs, scores: {} }, 0, ctx.now);
      }
      case 'answer': {
        if (s.phase !== 'answer' || s.answers[a.from] !== undefined) return s;
        const v = Number(a.v);
        if (!Number.isFinite(v)) return s;
        const next = { ...s, answers: { ...s.answers, [a.from]: v } };
        return allDone(ctx.players, Object.keys(next.answers)) ? reveal(next) : next;
      }
      case 'tick':
        if (s.phase === 'answer' && (ctx.now >= s.deadline || allDone(ctx.players, Object.keys(s.answers)))) return reveal(s);
        return s;
      case 'next':
        if (s.phase !== 'reveal') return s;
        if (s.idx + 1 >= s.qs.length) return { ...s, phase: 'final' };
        return ask(s, s.idx + 1, ctx.now);
      case 'again':
        if (s.phase !== 'final') return s;
        return { ...s, phase: 'setup', qs: [], idx: 0, answers: {}, results: [], gained: {}, farthest: [], scores: {} };
    }
    return s;
  },
  View,
};
