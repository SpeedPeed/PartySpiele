import { PromptCard } from '../../components/ui';
import { WER_WUERDE_EHER } from '../../data/werWuerdeEher';
import { pick } from '../../lib/random';
import { BigTitle, HostButton, MemberChip, Scoreboard, VoteGrid, WaitingFor, filterLevels, present } from '../kit';
import type { OnlineCtx, OnlineGameDef, OnlineViewProps } from '../types';

interface S {
  phase: 'vote' | 'result';
  round: number;
  question: string;
  votes: Record<string, string>;
  total: Record<string, number>;
}

type A = { type: 'vote'; target: string } | { type: 'next' };

function newQuestion(ctx: OnlineCtx): string {
  return pick(filterLevels(WER_WUERDE_EHER, ctx.levels)).t;
}

function View({ state, me, isHost, players, send, fill }: OnlineViewProps<S, A>) {
  const myVote = state.votes[me.id];
  const voted = Object.keys(state.votes);

  if (state.phase === 'vote') {
    return (
      <div className="col">
        <PromptCard kicker={`Runde ${state.round} · Wer würde eher …`} text={state.question + '?'} color="#ffe03a" cardKey={state.round} />
        {myVote ? (
          <>
            <p className="center">Stimme abgegeben – anonym! 🤐</p>
            <WaitingFor players={players} done={voted} />
          </>
        ) : (
          <>
            <h3 className="center">Stimm geheim ab:</h3>
            <VoteGrid players={players} onVote={(id) => send({ type: 'vote', target: id })} />
          </>
        )}
      </div>
    );
  }

  const counts: Record<string, number> = {};
  for (const t of Object.values(state.votes)) counts[t] = (counts[t] ?? 0) + 1;
  const ranked = players.filter((p) => counts[p.id]).sort((a, b) => counts[b.id] - counts[a.id]);
  const max = ranked.length ? counts[ranked[0].id] : 0;
  const losers = ranked.filter((p) => counts[p.id] === max);
  const iLost = losers.some((p) => p.id === me.id);

  return (
    <div className="col">
      <PromptCard kicker="Ergebnis" text={state.question + '?'} color="#ffe03a" />
      <BigTitle color="var(--pink)">{losers.map((l) => l.avatar + ' ' + l.name).join(' & ')}</BigTitle>
      <p className="center">{iLost ? '😱 Das bist DU! ' : ''}{fill(`Pro Stimme {s:1}!`)}</p>
      <div className="col" style={{ gap: 8 }}>
        {ranked.map((p) => (
          <div className="score-row" key={p.id}>
            <MemberChip m={p} />
            <span className="grow" />
            <span className="val">{'▮'.repeat(counts[p.id])} {counts[p.id]}</span>
          </div>
        ))}
      </div>
      <Scoreboard players={players} scores={state.total} title="Gesamt-Stimmen (Abend)" />
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        Nächste Frage ▶
      </HostButton>
    </div>
  );
}

export const abstimmung: OnlineGameDef<S, A> = {
  id: 'abstimmung',
  name: 'Wer würde eher – Anonym',
  emoji: '🗳️',
  tagline: 'Geheime Abstimmung auf allen Handys',
  color: '#ffe03a',
  minPlayers: 3,
  levels: true,
  rules: ['Alle sehen dieselbe Frage und stimmen geheim auf ihrem Handy ab.', 'Wer die meisten Stimmen hat, steht am Pranger.', 'Pro Stimme ein Schluck – niemand weiß, wer wen gewählt hat!'],
  init: (ctx) => ({ phase: 'vote', round: 1, question: newQuestion(ctx), votes: {}, total: {} }),
  reduce(s, a, ctx) {
    if (a.type === 'vote' && s.phase === 'vote' && !s.votes[a.from]) {
      const votes = { ...s.votes, [a.from]: a.target };
      const all = present(ctx.players, Object.keys(votes)).length >= ctx.players.length;
      if (!all) return { ...s, votes };
      const total = { ...s.total };
      for (const t of Object.values(votes)) total[t] = (total[t] ?? 0) + 1;
      return { ...s, votes, total, phase: 'result' };
    }
    if (a.type === 'next' && s.phase === 'result') {
      return { ...s, phase: 'vote', round: s.round + 1, question: newQuestion(ctx), votes: {} };
    }
    if (a.type === 'tick' && s.phase === 'vote') {
      // someone left – finish the round if everyone remaining has voted
      const remaining = present(ctx.players, Object.keys(s.votes)).length;
      if (remaining > 0 && remaining >= ctx.players.length) {
        const total = { ...s.total };
        for (const t of Object.values(s.votes)) total[t] = (total[t] ?? 0) + 1;
        return { ...s, total, phase: 'result' };
      }
    }
    return s;
  },
  View,
};
