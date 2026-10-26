import { useState, type CSSProperties } from 'react';
import { Button, Panel, PromptCard, Toggle } from '../../components/ui';
import { ICH_HAB_NOCH_NIE } from '../../data/ichHabNochNie';
import { pick } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, MemberChip, Scoreboard, WaitingFor, filterLevels, present } from '../kit';
import type { OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';
import { Bar, FinalScreen, OptionRow, SetupScreen, addScores, useOnChange } from './shared';

const SECONDS = 45;

interface S {
  phase: 'setup' | 'answer' | 'reveal' | 'final';
  rounds: number;
  round: number;
  guessMode: boolean;
  question: string;
  deadline: number;
  /** Nur WER schon geantwortet hat – nicht WAS (Anonymität). */
  answered: string[];
  yes: number;
  guesses: Record<string, number>;
  /** Anzahl Spieler beim Rundenstart (Obergrenze fürs Schätzen). */
  n: number;
  gained: Record<string, number>;
  scores: Record<string, number>;
  used: string[];
  totalYes: number;
  totalAnswers: number;
  hottest: { q: string; pct: number } | null;
}

type A = { type: 'start'; rounds: number; guessMode: boolean } | { type: 'answer'; yes: boolean } | { type: 'guess'; n: number } | { type: 'next' } | { type: 'again' };

function newQuestion(s: S, ctx: OnlineCtx): { question: string; used: string[] } {
  const pool = filterLevels(ICH_HAB_NOCH_NIE, ctx.levels);
  let fresh = pool.filter((p) => !s.used.includes(p.t));
  let used = s.used;
  if (!fresh.length) {
    fresh = pool;
    used = [];
  }
  const question = pick(fresh).t;
  return { question, used: [...used, question] };
}

function startRound(s: S, ctx: OnlineCtx, round: number): S {
  const { question, used } = newQuestion(s, ctx);
  return { ...s, phase: 'answer', round, question, used, deadline: ctx.now + SECONDS * 1000, answered: [], yes: 0, guesses: {}, n: ctx.players.length, gained: {} };
}

function isDone(s: S, id: string): boolean {
  return s.answered.includes(id) && (!s.guessMode || s.guesses[id] !== undefined);
}

function everyoneDone(s: S, ctx: OnlineCtx): boolean {
  const done = ctx.players.filter((p) => isDone(s, p.id)).map((p) => p.id);
  return ctx.players.length > 0 && present(ctx.players, done).length >= ctx.players.length;
}

function reveal(s: S): S {
  const gained: Record<string, number> = {};
  if (s.guessMode) {
    for (const [id, g] of Object.entries(s.guesses)) {
      const d = Math.abs(g - s.yes);
      if (d === 0) gained[id] = 3;
      else if (d === 1) gained[id] = 1;
    }
  }
  const total = s.answered.length;
  const pct = total ? s.yes / total : 0;
  const hottest = total && (!s.hottest || pct > s.hottest.pct) ? { q: s.question, pct } : s.hottest;
  return { ...s, phase: 'reveal', gained, scores: addScores(s.scores, gained), totalYes: s.totalYes + s.yes, totalAnswers: s.totalAnswers + total, hottest };
}

function comment(yes: number, total: number): string {
  if (!total) return 'Keiner hat sich getraut zu antworten. Feiglinge! 🐔';
  const r = yes / total;
  if (r === 0) return 'Lauter Heilige! 😇 Wer’s glaubt, wird selig …';
  if (r === 1) return 'Ganze Runde Sünder! 🔥 Prost, ihr Gfraster!';
  if (r < 0.25) return 'Fast lauter Engerl – aber ein schwarzes Schaf ist dabei 🐑';
  if (r < 0.5) return 'Eine kleine, feine Sündergruppe. Respekt! 😏';
  if (r === 0.5) return 'Halbe-halbe! Die Runde ist gespalten ⚖️';
  if (r < 0.75) return 'Die Mehrheit hat’s schon gemacht – Oida! 😈';
  return 'Fast alle! Wer ist da noch der letzte Heilige? 👼';
}

function View({ state: s, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const [rounds, setRounds] = useState(s.rounds);
  const [guessMode, setGuessMode] = useState(s.guessMode);
  /** Eigene Antworten bleiben NUR auf diesem Handy. */
  const [mine, setMine] = useState<Record<number, boolean>>({});

  useOnChange(s.phase + s.round, () => {
    if (s.phase !== 'reveal') return;
    sfx.drumroll(0.8);
    setTimeout(() => (s.yes > 0 ? sfx.boom() : sfx.success()), 850);
    buzz(60);
  });

  if (s.phase === 'setup')
    return (
      <SetupScreen
        isHost={isHost}
        emoji="⛪"
        title="Anonyme Beichte"
        players={players}
        intro={
          <>
            „Ich hab noch nie …“ – aber geheim! Jeder drückt am eigenen Handy. Angezeigt wird nur, <b>wie viele</b> es schon gemacht haben – nie wer. Sünder trinken {fill('{s:1}')} – Ehrensache!
          </>
        }
        onStart={() => send({ type: 'start', rounds, guessMode })}
      >
        <OptionRow label="Runden" value={rounds} onChange={setRounds} options={[10, 15, 20].map((n) => ({ value: n, label: String(n) }))} />
        <Toggle label="🎯 Schätz-Modus" hint="Vor der Auflösung schätzt jeder, wie viele schon … Treffer = Punkte." value={guessMode} onChange={setGuessMode} />
      </SetupScreen>
    );

  if (s.phase === 'final') {
    const mySins = Object.values(mine).filter(Boolean).length;
    const myTotal = Object.keys(mine).length;
    const pct = s.totalAnswers ? Math.round((s.totalYes / s.totalAnswers) * 100) : 0;
    const summary = (
      <Panel>
        <div className="muted small">Sünden-Quote des Abends</div>
        <Bar value={pct} max={100} color="var(--pink)" />
        <div className="center pixel" style={{ fontSize: 14, marginTop: 6 }}>
          {pct}% 😈
        </div>
        {s.hottest && (
          <p className="small">
            🔥 Größte Sünde: „Ich hab noch nie {s.hottest.q}“ – {Math.round(s.hottest.pct * 100)}%
          </p>
        )}
        <p className="small muted">🤫 Nur du siehst das: Du hast {mySins} von {myTotal} Sachen schon gemacht.</p>
      </Panel>
    );
    if (!s.guessMode)
      return (
        <div className="col">
          <BigTitle>⛪ Beichte vorbei ⛪</BigTitle>
          <p className="center">Euch sei vergeben. Vielleicht. 🙏</p>
          {summary}
          <HostButton isHost={isHost} color="yellow" onClick={() => send({ type: 'again' })} waitText="Der Host entscheidet, ob’s noch eine Runde gibt …">
            🔁 Nochmal!
          </HostButton>
        </div>
      );
    return (
      <FinalScreen players={players} scores={s.scores} me={me} isHost={isHost} fill={fill} onAgain={() => send({ type: 'again' })} title="Schätz-Meister" unit=" P">
        {summary}
      </FinalScreen>
    );
  }

  const card = <PromptCard kicker={`Runde ${s.round}/${s.rounds} · Ich hab noch nie …`} text={'… ' + s.question + '.'} color="#19e3ff" cardKey={s.round} />;

  if (s.phase === 'answer') {
    const answered = s.answered.includes(me.id);
    const guessed = s.guesses[me.id] !== undefined;
    const done = players.filter((p) => isDone(s, p.id)).map((p) => p.id);
    const max = Math.max(s.n, players.length);
    return (
      <div className="col">
        <Countdown deadline={s.deadline} total={SECONDS} />
        {card}
        {!answered ? (
          <>
            <p className="center muted small">🤫 Geheim! Niemand sieht, was du drückst.</p>
            <div className="grid2">
              <ChoiceButton color="#ff2e88" emoji="😈" label="Hab ich schon" onClick={() => (setMine((m) => ({ ...m, [s.round]: true })), send({ type: 'answer', yes: true }))} />
              <ChoiceButton color="#3dff6e" emoji="😇" label="Nie im Leben" onClick={() => (setMine((m) => ({ ...m, [s.round]: false })), send({ type: 'answer', yes: false }))} />
            </div>
          </>
        ) : s.guessMode && !guessed ? (
          <>
            <h3 className="center">🎯 Wie viele haben’s schon gemacht?</h3>
            <div className="grid3">
              {Array.from({ length: max + 1 }, (_, i) => (
                <Button key={i} color="cyan" onClick={() => send({ type: 'guess', n: i })}>
                  {i}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="center">
              Gebeichtet{s.guessMode ? ` & geschätzt (${s.guesses[me.id]})` : ''} – {mine[s.round] === undefined ? 'still wie ein Grab' : mine[s.round] ? 'du alter Sünder 😈' : 'brav, brav 😇'} 🤐
            </p>
            <WaitingFor players={players} done={done} />
          </>
        )}
      </div>
    );
  }

  // reveal
  const total = s.answered.length;
  const iSinned = mine[s.round] === true;
  const exact = players.filter((p) => s.guesses[p.id] === s.yes);
  return (
    <div className="col">
      {card}
      <Panel glow={s.yes ? 'pink' : 'cyan'}>
        <div className="center pixel" style={{ fontSize: 22, color: 'var(--pink)', lineHeight: 1.5 }}>
          {s.yes} / {total}
        </div>
        <div className="center muted small">haben’s schon gemacht</div>
        <div style={{ marginTop: 8 }}>
          <Bar value={s.yes} max={total} color="var(--pink)" label={<span className="small">😈 Schon gemacht: {s.yes}</span>} />
        </div>
        <div style={{ marginTop: 8 }}>
          <Bar value={total - s.yes} max={total} color="var(--green)" label={<span className="small">😇 Nie im Leben: {total - s.yes}</span>} />
        </div>
      </Panel>
      <BigTitle color={s.yes ? 'var(--pink)' : 'var(--green)'}>{comment(s.yes, total)}</BigTitle>
      {s.yes > 0 && <p className="center">{fill('Alle Sünder trinken {s:1} – Ehrensache, keiner schaut!')}</p>}
      {iSinned && <div className="notice center">🤫 Du warst dabei: {fill('{s:1}')}!</div>}
      {s.guessMode && (
        <Panel>
          <h3>🎯 Schätzungen</h3>
          <div className="row wrap">
            {players
              .filter((p) => s.guesses[p.id] !== undefined)
              .map((p) => (
                <MemberChip key={p.id} m={p} selected={s.guesses[p.id] === s.yes} extra={<span className="pixel" style={{ fontSize: 10 }}>{s.guesses[p.id]}{s.gained[p.id] ? ` +${s.gained[p.id]}` : ''}</span>} />
              ))}
          </div>
          {exact.length > 0 ? (
            <p className="small" style={{ color: 'var(--green)' }}>
              Volltreffer: {exact.map((p) => p.name).join(', ')} – {exact.length > 1 ? 'dürfen je' : 'darf'} {fill('{s:2}')} verteilen! (Exakt +3, knapp daneben +1)
            </p>
          ) : (
            <p className="small muted">Keiner hat’s genau erraten. (Exakt +3, knapp daneben +1)</p>
          )}
          <Scoreboard players={players} scores={s.scores} title="Schätz-Punkte" />
        </Panel>
      )}
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        {s.round >= s.rounds ? '🏁 Zum Abschluss' : 'Nächste Beichte ▶'}
      </HostButton>
    </div>
  );
}

function ChoiceButton({ color, emoji, label, onClick }: { color: string; emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      className="tile"
      style={{ '--tc': color, minHeight: 150, alignItems: 'center', justifyContent: 'center' } as CSSProperties}
      onClick={() => {
        sfx.select();
        buzz(30);
        onClick();
      }}
    >
      <span style={{ fontSize: 54 }}>{emoji}</span>
      <span className="t-name">{label}</span>
    </button>
  );
}

export const beichte: OnlineGameDef<S, A> = {
  id: 'beichte',
  name: 'Anonyme Beichte',
  emoji: '⛪',
  tagline: 'Ich hab noch nie – aber geheim',
  color: '#a64dff',
  minPlayers: 3,
  levels: true,
  rules: [
    'Ein „Ich hab noch nie …“-Satz erscheint auf allen Handys.',
    'Jeder drückt geheim „Hab ich schon 😈“ oder „Nie im Leben 😇“.',
    'Gezeigt wird nur, WIE VIELE es schon gemacht haben – nie wer.',
    'Wer schon mal: 1 Schluck – jeder trinkt selbst, Ehrensache!',
    'Schätz-Modus: Vorher schätzt jeder die Anzahl. Exakt = 3 Punkte und 2 Schlucke verteilen, um 1 daneben = 1 Punkt.',
  ],
  init: () => ({
    phase: 'setup',
    rounds: 10,
    round: 0,
    guessMode: true,
    question: '',
    deadline: 0,
    answered: [],
    yes: 0,
    guesses: {},
    n: 0,
    gained: {},
    scores: {},
    used: [],
    totalYes: 0,
    totalAnswers: 0,
    hottest: null,
  }),
  reduce(s, a, ctx) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'setup') return s;
        const rounds = [10, 15, 20].includes(a.rounds) ? a.rounds : 10;
        return startRound({ ...s, rounds, guessMode: !!a.guessMode, scores: {}, totalYes: 0, totalAnswers: 0, hottest: null }, ctx, 1);
      }
      case 'answer': {
        if (s.phase !== 'answer' || s.answered.includes(a.from)) return s;
        const next = { ...s, answered: [...s.answered, a.from], yes: s.yes + (a.yes ? 1 : 0) };
        return everyoneDone(next, ctx) ? reveal(next) : next;
      }
      case 'guess': {
        if (s.phase !== 'answer' || !s.guessMode || s.guesses[a.from] !== undefined) return s;
        const n = Math.max(0, Math.min(99, Math.round(Number(a.n) || 0)));
        const next = { ...s, guesses: { ...s.guesses, [a.from]: n } };
        return everyoneDone(next, ctx) ? reveal(next) : next;
      }
      case 'tick':
        if (s.phase === 'answer' && (ctx.now >= s.deadline || everyoneDone(s, ctx))) return reveal(s);
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
