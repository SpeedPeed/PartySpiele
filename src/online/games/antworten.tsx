import { useState, type CSSProperties } from 'react';
import { Panel, PromptCard } from '../../components/ui';
import { ANTWORT_PROMPTS } from '../../data/quiplash';
import { shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, MemberChip, Scoreboard, TextAnswer, WaitingFor, filterLevels, present } from '../kit';
import type { OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';
import { FinalScreen, OptionRow, SetupScreen, addScores, allDone, fillNames, useOnChange, useTickingSeconds } from './shared';

const WRITE_SECONDS = 60;
const VOTE_SECONDS = 30;
const GAUDI_BONUS = 500;

interface S {
  phase: 'setup' | 'write' | 'vote' | 'reveal' | 'final';
  rounds: number;
  round: number;
  prompt: string;
  deadline: number;
  answers: Record<string, string>;
  /** Autoren in zufälliger (anonymer) Reihenfolge. */
  order: string[];
  votes: Record<string, string>;
  gained: Record<string, number>;
  gaudi: string | null;
  scores: Record<string, number>;
  used: string[];
}

type A = { type: 'start'; rounds: number } | { type: 'answer'; text: string } | { type: 'vote'; author: string } | { type: 'next' } | { type: 'again' };

function startRound(s: S, ctx: OnlineCtx, round: number): S {
  const pool = filterLevels(ANTWORT_PROMPTS, ctx.levels);
  let fresh = pool.filter((p) => !s.used.includes(p.t));
  let used = s.used;
  if (!fresh.length) {
    fresh = pool;
    used = [];
  }
  const raw = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)].t : 'Das Schlimmste, was man bei einer Party sagen kann: ___';
  return {
    ...s,
    phase: 'write',
    round,
    prompt: fillNames(raw, ctx.players),
    used: [...used, raw],
    deadline: ctx.now + WRITE_SECONDS * 1000,
    answers: {},
    order: [],
    votes: {},
    gained: {},
    gaudi: null,
  };
}

/** Wer kann abstimmen? Jeder, der mindestens eine fremde Antwort zur Auswahl hat. */
function voters(s: S, ctx: OnlineCtx): string[] {
  return ctx.players.filter((p) => s.order.some((a) => a !== p.id)).map((p) => p.id);
}

function toVote(s: S, ctx: OnlineCtx): S {
  const order = shuffle(Object.keys(s.answers));
  if (!order.length) return reveal({ ...s, order });
  return { ...s, phase: 'vote', order, votes: {}, deadline: ctx.now + VOTE_SECONDS * 1000 };
}

function votingDone(s: S, ctx: OnlineCtx): boolean {
  const need = voters(s, ctx);
  if (!need.length) return true;
  return present(ctx.players, Object.keys(s.votes)).filter((id) => need.includes(id)).length >= need.length;
}

function reveal(s: S): S {
  const counts: Record<string, number> = {};
  for (const a of Object.values(s.votes)) counts[a] = (counts[a] ?? 0) + 1;
  const gained: Record<string, number> = {};
  for (const [a, n] of Object.entries(counts)) gained[a] = n * 100;
  const totalVotes = Object.keys(s.votes).length;
  let gaudi: string | null = null;
  const top = Object.entries(counts).find(([, n]) => n === totalVotes);
  if (top && totalVotes >= 2) {
    gaudi = top[0];
    gained[gaudi] = (gained[gaudi] ?? 0) + GAUDI_BONUS;
  }
  return { ...s, phase: 'reveal', gained, gaudi, scores: addScores(s.scores, gained) };
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [rounds, setRounds] = useState(s.rounds);
  useTickingSeconds(s.phase === 'write' || s.phase === 'vote' ? s.deadline : null);

  useOnChange(s.phase + s.round, () => {
    if (s.phase !== 'reveal') return;
    if (s.gaudi) {
      sfx.fanfare();
      buzz([60, 40, 60, 40, 200]);
    } else if (s.gained[me.id]) sfx.coin();
    else sfx.fail();
  });

  if (s.phase === 'setup')
    return (
      <SetupScreen
        isHost={isHost}
        emoji="✍️"
        title="Gaudi-Antworten"
        players={players}
        intro={
          <>
            Alle bekommen denselben Satz und schreiben die lustigste Antwort. Dann wird anonym abgestimmt. Jede Stimme = 100 Punkte, alle Stimmen = <b>GAUDI!</b>-Bonus. Keine Stimme: {fill('{s:1}')}!
          </>
        }
        onStart={() => send({ type: 'start', rounds })}
      >
        <OptionRow label="Runden" value={rounds} onChange={setRounds} options={[5, 8].map((n) => ({ value: n, label: String(n) }))} />
      </SetupScreen>
    );

  if (s.phase === 'final') return <FinalScreen players={players} scores={s.scores} me={me} isHost={isHost} fill={fill} onAgain={() => send({ type: 'again' })} title="Gaudi-König" />;

  const card = <PromptCard kicker={`Runde ${s.round}/${s.rounds}`} text={fill(s.prompt)} color="#ff8a1f" cardKey={s.round} />;

  if (s.phase === 'write') {
    const mine = s.answers[me.id];
    return (
      <div className="col">
        <Countdown deadline={s.deadline} total={WRITE_SECONDS} />
        {card}
        {mine === undefined ? (
          <TextAnswer key={s.round} maxLength={80} placeholder="Deine lustigste Antwort …" onSubmit={(t) => (sfx.select(), send({ type: 'answer', text: t }))} />
        ) : (
          <Panel>
            <div className="muted small">Deine Antwort:</div>
            <div style={{ fontSize: 24 }}>„{mine}“</div>
          </Panel>
        )}
        <WaitingFor players={players} done={Object.keys(s.answers)} label="Die schreiben noch" />
      </div>
    );
  }

  if (s.phase === 'vote') {
    const myVote = s.votes[me.id];
    const canVote = s.order.some((a) => a !== me.id);
    const need = players.filter((p) => s.order.some((a) => a !== p.id));
    return (
      <div className="col">
        <Countdown deadline={s.deadline} total={VOTE_SECONDS} />
        {card}
        <h3 className="center">{myVote ? 'Stimme abgegeben! 🗳️' : canVote ? 'Welche ist die Beste?' : 'Die anderen stimmen ab …'}</h3>
        <div className="col" style={{ gap: 10 }}>
          {s.order.map((author) => {
            const own = author === me.id;
            const sel = myVote === author;
            return (
              <button
                key={author}
                disabled={own || !!myVote}
                className="tile"
                onClick={() => {
                  sfx.select();
                  buzz(25);
                  send({ type: 'vote', author });
                }}
                style={
                  {
                    '--tc': sel ? 'var(--yellow)' : own ? 'var(--muted)' : 'var(--orange)',
                    minHeight: 64,
                    textAlign: 'left',
                    alignItems: 'flex-start',
                    fontSize: 24,
                    opacity: own ? 0.5 : myVote && !sel ? 0.6 : 1,
                    outline: sel ? '4px solid var(--yellow)' : undefined,
                    color: 'var(--ink)',
                  } as CSSProperties
                }
              >
                „{s.answers[author]}“{own && <span className="muted small"> (deine)</span>}
              </button>
            );
          })}
        </div>
        <WaitingFor players={need} done={Object.keys(s.votes)} />
      </div>
    );
  }

  // reveal
  const ranked = s.order.slice().sort((a, b) => (s.gained[b] ?? 0) - (s.gained[a] ?? 0));
  const zero = players.filter((p) => !s.gained[p.id]);
  const member = (id: string) => players.find((p) => p.id === id);
  return (
    <div className="col">
      {card}
      {s.gaudi && (
        <BigTitle color="var(--orange)">
          <span className="pulse" style={{ display: 'inline-block' }}>
            💥 GAUDI! 💥
          </span>
          <br />
          {member(s.gaudi)?.name ?? '?'} kriegt ALLE Stimmen! +{GAUDI_BONUS}
        </BigTitle>
      )}
      <div className="col" style={{ gap: 10 }}>
        {ranked.map((author) => {
          const m = member(author);
          const vs = players.filter((p) => s.votes[p.id] === author);
          return (
            <Panel key={author} glow={s.gaudi === author ? 'yellow' : undefined}>
              <div style={{ fontSize: 24 }}>„{s.answers[author]}“</div>
              <div className="row between" style={{ marginTop: 6 }}>
                {m ? <MemberChip m={m} /> : <span className="muted">👻 weg</span>}
                <span className="pixel" style={{ fontSize: 12, color: 'var(--cyan)' }}>
                  +{s.gained[author] ?? 0}
                </span>
              </div>
              {vs.length > 0 && <div className="small muted">🗳️ {vs.map((v) => v.avatar + ' ' + v.name).join(', ')}</div>}
            </Panel>
          );
        })}
        {!s.order.length && <p className="center">Keiner hat was geschrieben?! Schreibfaule Bande! 🙄</p>}
      </div>
      {zero.length > 0 && (
        <div className="notice center">
          Null Stimmen: {zero.map((z) => z.name).join(', ')} – {fill('{s:1}')}! {zero.some((z) => z.id === me.id) ? '(Ja, du auch.)' : ''}
        </div>
      )}
      <Scoreboard players={players} scores={s.scores} />
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        {s.round >= s.rounds ? '🏁 Zum Finale' : 'Nächste Runde ▶'}
      </HostButton>
    </div>
  );
}

export const antworten: OnlineGameDef<S, A> = {
  id: 'antworten',
  name: 'Gaudi-Antworten',
  emoji: '✍️',
  tagline: 'Die lustigste Antwort gewinnt',
  color: '#ff8a1f',
  minPlayers: 3,
  levels: true,
  rules: [
    'Alle bekommen denselben Satz und schreiben in 60 Sekunden die lustigste Antwort.',
    'Dann werden alle Antworten anonym gezeigt – jeder stimmt für die beste (nicht die eigene).',
    'Jede Stimme = 100 Punkte. Wer ALLE Stimmen bekommt, kriegt den GAUDI!-Bonus (+500).',
    'Wer keine einzige Stimme bekommt: 1 Schluck.',
  ],
  init: () => ({ phase: 'setup', rounds: 5, round: 0, prompt: '', deadline: 0, answers: {}, order: [], votes: {}, gained: {}, gaudi: null, scores: {}, used: [] }),
  reduce(s, a, ctx) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'setup') return s;
        const rounds = a.rounds === 8 ? 8 : 5;
        return startRound({ ...s, rounds, scores: {} }, ctx, 1);
      }
      case 'answer': {
        if (s.phase !== 'write' || s.answers[a.from] !== undefined) return s;
        const text = String(a.text ?? '').trim().slice(0, 80);
        if (!text) return s;
        const next = { ...s, answers: { ...s.answers, [a.from]: text } };
        return allDone(ctx.players, Object.keys(next.answers)) ? toVote(next, ctx) : next;
      }
      case 'vote': {
        if (s.phase !== 'vote' || s.votes[a.from] || a.author === a.from || !s.order.includes(a.author)) return s;
        const next = { ...s, votes: { ...s.votes, [a.from]: a.author } };
        return votingDone(next, ctx) ? reveal(next) : next;
      }
      case 'tick':
        if (s.phase === 'write' && (ctx.now >= s.deadline || allDone(ctx.players, Object.keys(s.answers)))) return toVote(s, ctx);
        if (s.phase === 'vote' && (ctx.now >= s.deadline || votingDone(s, ctx))) return reveal(s);
        return s;
      case 'next':
        if (s.phase !== 'reveal') return s;
        if (s.round >= s.rounds) return { ...s, phase: 'final' };
        return startRound(s, ctx, s.round + 1);
      case 'again':
        if (s.phase !== 'final') return s;
        return { ...s, phase: 'setup', round: 0, scores: {}, gained: {} };
    }
    return s;
  },
  View,
};
