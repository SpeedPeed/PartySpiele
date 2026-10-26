import { useEffect, useState } from 'react';
import { Button, Confetti, PlayerChip, Seg, TimerBar } from '../components/ui';
import { TABU } from '../data/tabu';
import type { TabuCard } from '../data/types';
import { useCountdown } from '../lib/hooks';
import { getDeck, shuffle } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { useStore } from '../lib/store';
import './arcadeGames.css';

type Phase = 'setup' | 'handover' | 'play' | 'roundEnd' | 'winner';
type Mark = 'ok' | 'tabu' | 'skip';

const TEAM_COLORS = ['#ff2e88', '#19e3ff'];
const DEFAULT_NAMES = ['Team Krapfen', 'Team Schnitzel'];

export default function Tabu() {
  const { players, addStat } = useStore();
  const [phase, setPhase] = useState<Phase>('setup');
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [assign, setAssign] = useState<Record<string, 0 | 1>>({});
  const [secs, setSecs] = useState(60);
  const [target, setTarget] = useState(20);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [team, setTeam] = useState<0 | 1>(0);
  const [turns, setTurns] = useState<[number, number]>([0, 0]);
  const [card, setCard] = useState<TabuCard | undefined>();
  const [log, setLog] = useState<{ w: string; m: Mark }[]>([]);
  const [shaking, setShaking] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [cardN, setCardN] = useState(0);

  const endRound = () => {
    sfx.buzzer();
    buzz([400, 100, 400]);
    setPhase('roundEnd');
  };
  const timer = useCountdown(secs, endRound, { tick: true });

  // leises Ticken jede Sekunde
  useEffect(() => {
    if (phase === 'play' && timer.running && timer.left > 5) sfx.tock();
  }, [timer.left, timer.running, phase]);

  const teamPlayers = (t: 0 | 1) => players.filter((p) => assign[p.id] === t);
  const explainer = (t: 0 | 1) => {
    const list = teamPlayers(t);
    return list.length ? list[turns[t] % list.length] : null;
  };

  const draw = () => {
    setCard(getDeck('tabu', TABU).draw());
    setCardN((n) => n + 1);
  };

  const cycleAssign = (id: string) => {
    setAssign((a) => {
      const cur = a[id];
      const next = { ...a };
      if (cur === undefined) next[id] = 0;
      else if (cur === 0) next[id] = 1;
      else delete next[id];
      return next;
    });
  };

  const randomTeams = () => {
    const sh = shuffle(players);
    const a: Record<string, 0 | 1> = {};
    sh.forEach((p, i) => (a[p.id] = (i % 2) as 0 | 1));
    setAssign(a);
    sfx.select();
  };

  const startGame = () => {
    setScore([0, 0]);
    setTurns([0, 0]);
    setTeam(0);
    setPhase('handover');
    sfx.select();
  };

  const startRound = () => {
    setLog([]);
    draw();
    setPhase('play');
    timer.start(secs);
    sfx.powerup();
  };

  const act = (m: Mark) => {
    if (!card || phase !== 'play') return;
    setLog((l) => [...l, { w: card.w, m }]);
    if (m === 'ok') {
      setScore((s) => (team === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]));
      sfx.coin();
      buzz(30);
    } else if (m === 'tabu') {
      setScore((s) => (team === 0 ? [s[0] - 1, s[1]] : [s[0], s[1] - 1]));
      sfx.buzzer();
      buzz([200, 50, 200]);
      setShaking(true);
      setTimeout(() => setShaking(false), 450);
    } else {
      sfx.whoosh();
    }
    draw();
  };

  const afterRound = () => {
    const nt: [number, number] = team === 0 ? [turns[0] + 1, turns[1]] : [turns[0], turns[1] + 1];
    setTurns(nt);
    if (team === 1 && (score[0] >= target || score[1] >= target) && score[0] !== score[1]) {
      const w = score[0] > score[1] ? 0 : 1;
      setPhase('winner');
      setConfetti((c) => c + 1);
      sfx.fanfare();
      buzz([100, 50, 100, 50, 300]);
      teamPlayers(w as 0 | 1).forEach((p) => addStat(p.id, 'wins', 1));
      return;
    }
    setTeam(team === 0 ? 1 : 0);
    setPhase('handover');
    sfx.whoosh();
  };

  const scoreBar = (
    <div className="ga-score-big panel" style={{ padding: 10 }}>
      {[0, 1].map((t) => (
        <div key={t} className="center" style={{ opacity: phase === 'play' && team !== t ? 0.5 : 1 }}>
          <div className="n" style={{ color: TEAM_COLORS[t] }}>
            {score[t]}
          </div>
          <div className="t">{names[t]}</div>
        </div>
      ))}
      <div className="center">
        <div className="pixel" style={{ fontSize: 9, color: 'var(--muted)' }}>
          ZIEL
        </div>
        <div className="pixel" style={{ fontSize: 14, color: 'var(--yellow)' }}>
          {target}
        </div>
      </div>
    </div>
  );

  if (phase === 'setup') {
    return (
      <div className="screen">
        <div className="center">
          <div className="avatar-big">🚫</div>
          <div className="ga-title">TABU</div>
        </div>
        <h2>Teams</h2>
        {[0, 1].map((t) => (
          <div key={t} className="row">
            <span style={{ width: 16, height: 40, background: TEAM_COLORS[t], boxShadow: '0 0 0 3px var(--shadow)' }} />
            <input
              className="input"
              value={names[t]}
              maxLength={22}
              onChange={(e) => setNames((n) => n.map((x, i) => (i === t ? e.target.value : x)))}
            />
          </div>
        ))}
        {players.length > 0 && (
          <>
            <h3>Spieler zuordnen (optional, antippen)</h3>
            <div className="row wrap">
              {players.map((p) => {
                const a = assign[p.id];
                return (
                  <PlayerChip
                    key={p.id}
                    player={{ ...p, color: a === undefined ? p.color : TEAM_COLORS[a] }}
                    selected={a !== undefined}
                    onClick={() => cycleAssign(p.id)}
                    extra={<span className="pixel" style={{ fontSize: 8 }}>{a === undefined ? '–' : a === 0 ? 'A' : 'B'}</span>}
                  />
                );
              })}
            </div>
            <Button small color="purple" onClick={randomTeams}>
              🎲 Zufällig aufteilen
            </Button>
          </>
        )}
        <h2>Rundenzeit</h2>
        <Seg
          options={[
            { value: 60, label: '60 s' },
            { value: 90, label: '90 s' },
          ]}
          value={secs}
          onChange={setSecs}
          color="var(--pink)"
        />
        <h2>Zielpunkte</h2>
        <Seg
          options={[10, 20, 30, 50].map((v) => ({ value: v, label: String(v) }))}
          value={target}
          onChange={setTarget}
          color="var(--yellow)"
        />
        <Button color="pink" big block onClick={startGame}>
          ▶ Los geht’s
        </Button>
      </div>
    );
  }

  if (phase === 'handover') {
    const ex = explainer(team);
    return (
      <div className="screen centered center">
        {scoreBar}
        <div className="avatar-big ga-pop">📱</div>
        <div className="ga-kicker">Handy an</div>
        <div className="ga-title ga-pop" style={{ color: TEAM_COLORS[team], textShadow: '3px 3px 0 var(--shadow)' }}>
          {names[team]}
        </div>
        {ex ? (
          <p>
            Erklären darf: <PlayerChip player={ex} selected />
          </p>
        ) : (
          <p className="muted">Eine Person aus dem Team erklärt, das Gegnerteam schaut aufs Display mit.</p>
        )}
        <p className="muted small">{names[team === 0 ? 1 : 0]} passt auf die Tabu-Wörter auf!</p>
        <Button color="green" big block onClick={startRound}>
          ⏱ Bereit – Zeit läuft!
        </Button>
      </div>
    );
  }

  if (phase === 'play' && card) {
    return (
      <div className={'screen' + (shaking ? ' shake' : '')}>
        <div className="row between">
          <span className="pixel" style={{ fontSize: 10, color: TEAM_COLORS[team] }}>
            {names[team]}
          </span>
          <span className="pixel" style={{ fontSize: 16, color: timer.left <= 10 ? 'var(--red)' : 'var(--yellow)' }}>
            {timer.left}s
          </span>
        </div>
        <TimerBar left={timer.left} total={secs} />
        <div className="ga-tabu" key={cardN}>
          <div className="w">{card.w}</div>
          <ul>
            {card.f.map((f) => (
              <li key={f}>🚫 {f}</li>
            ))}
          </ul>
        </div>
        <div className="grid3">
          <Button color="green" onClick={() => act('ok')} silent>
            ✔ Richtig
          </Button>
          <Button color="red" onClick={() => act('tabu')} silent>
            ✘ Tabu
          </Button>
          <Button color="ghost" onClick={() => act('skip')} silent>
            ⏭ Skip
          </Button>
        </div>
        <p className="center muted small">
          Diese Runde: +{log.filter((l) => l.m === 'ok').length} / −{log.filter((l) => l.m === 'tabu').length} · Gesamt {score[team]}
        </p>
      </div>
    );
  }

  if (phase === 'roundEnd') {
    const plus = log.filter((l) => l.m === 'ok').length;
    const minus = log.filter((l) => l.m === 'tabu').length;
    return (
      <div className="screen">
        <div className="center ga-pop">
          <div className="ga-kicker">Zeit aus!</div>
          <div className="ga-title" style={{ color: TEAM_COLORS[team] }}>
            {plus - minus >= 0 ? '+' : ''}
            {plus - minus}
          </div>
          <p className="muted">
            {names[team]}: {plus} richtig, {minus} Tabu
          </p>
        </div>
        {scoreBar}
        <div className="list">
          {log.map((l, i) => (
            <div key={i} className="list-item" style={{ padding: '6px 10px', color: l.m === 'ok' ? 'var(--green)' : l.m === 'tabu' ? 'var(--red)' : 'var(--muted)' }}>
              <span style={{ width: 26 }}>{l.m === 'ok' ? '✔' : l.m === 'tabu' ? '✘' : '⏭'}</span>
              <span className="grow">{l.w}</span>
              <span className="pixel" style={{ fontSize: 9 }}>
                {l.m === 'ok' ? '+1' : l.m === 'tabu' ? '−1' : '0'}
              </span>
            </div>
          ))}
          {!log.length && <p className="muted center">Keine einzige Karte? Na servas…</p>}
        </div>
        <Button color="yellow" big block onClick={afterRound}>
          Weiter ▶
        </Button>
      </div>
    );
  }

  if (phase === 'winner') {
    const w = score[0] > score[1] ? 0 : 1;
    return (
      <div className="screen centered center">
        <Confetti fire={confetti} />
        <div className="avatar-big ga-pop">🏆</div>
        <div className="ga-kicker">Sieger</div>
        <div className="ga-title xl" style={{ color: TEAM_COLORS[w], textShadow: '4px 4px 0 var(--shadow)' }}>
          {names[w]}
        </div>
        <p style={{ fontSize: 28 }}>
          {score[w]} : {score[w === 0 ? 1 : 0]} – Leiwand! Die Verlierer zahlen die nächste Runde. 🍻
        </p>
        <div className="row wrap center">
          {teamPlayers(w as 0 | 1).map((p) => (
            <PlayerChip key={p.id} player={p} selected />
          ))}
        </div>
        <Button color="green" big block onClick={startGame}>
          🔁 Revanche
        </Button>
        <Button color="ghost" block onClick={() => setPhase('setup')}>
          Teams ändern
        </Button>
      </div>
    );
  }

  return null;
}
