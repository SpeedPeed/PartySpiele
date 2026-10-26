import { useEffect, useState } from 'react';
import { HEISSER_STUHL } from '../data/heisserStuhl';
import type { Level } from '../data/types';
import { useCountdown, useDeck, useFill, usePrompts } from '../lib/hooks';
import { useStore } from '../lib/store';
import { sips } from '../lib/format';
import { buzz, sfx } from '../lib/sound';
import { Button, Confetti, PlayerChip, PromptCard, TimerBar } from '../components/ui';
import './mixSpiele.css';

const SECONDS = 120;
const PENALTY = 2;

type Phase = 'pick' | 'play' | 'summary';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function HeisserStuhl() {
  const items = usePrompts(HEISSER_STUHL, 'heisserStuhl');
  const draw = useDeck('heisserStuhl', items);
  const fill = useFill();
  const { players, settings, addStat } = useStore();

  const [phase, setPhase] = useState<Phase>('pick');
  const [hotId, setHotId] = useState<string>(players[0]?.id ?? '');
  const [q, setQ] = useState<{ text: string; l: Level } | null>(null);
  const [asked, setAsked] = useState(0);
  const [refused, setRefused] = useState(0);
  const [shake, setShake] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [history, setHistory] = useState<Record<string, number>>({});

  const hot = players.find((p) => p.id === hotId) ?? players[0];

  const timer = useCountdown(
    SECONDS,
    () => {
      sfx.buzzer();
      buzz([300, 100, 300]);
      finish();
    },
    { tick: true },
  );

  // Extra-Ticks: jede halbe Minute ein Tock, in den letzten 10 s Ticks (die letzten 5 macht der Hook).
  useEffect(() => {
    if (!timer.running || timer.left === SECONDS) return;
    if (timer.left > 5 && timer.left <= 10) sfx.tick();
    else if (timer.left % 30 === 0) {
      sfx.tock();
      buzz(20);
    }
  }, [timer.left, timer.running]);

  const nextQ = () => {
    const c = draw();
    setQ(c ? { text: fill(c.t, hot).text, l: c.l } : null);
    setAsked((x) => x + 1);
    sfx.card();
  };

  const start = () => {
    setAsked(0);
    setRefused(0);
    nextQ();
    setPhase('play');
    timer.start(SECONDS);
    sfx.fanfare();
    buzz([60, 40, 60]);
  };

  function finish() {
    timer.stop();
    setPhase('summary');
    setHistory((h) => ({ ...h, [hot.id]: (h[hot.id] ?? 0) + 1 }));
    if (refused === 0) {
      setConfetti((c) => c + 1);
      sfx.success();
    }
  }

  const refuse = () => {
    addStat(hot.id, 'refused');
    addStat(hot.id, 'sips', PENALTY);
    setRefused((r) => r + 1);
    setShake((s) => s + 1);
    sfx.fail();
    buzz([80, 40, 80]);
    nextQ();
  };

  const nextPerson = () => {
    const i = players.findIndex((p) => p.id === hot.id);
    setHotId(players[(i + 1) % players.length].id);
    setPhase('pick');
    sfx.whoosh();
  };

  if (!hot) return null;
  const drink = settings.drinkMode && !hot.noAlcohol;

  if (phase === 'pick') {
    return (
      <div className="screen centered center">
        <div className="gx-fire">🔥🪑🔥</div>
        <h2>Wer kommt auf den heißen Stuhl?</h2>
        <div className="row wrap center">
          {players.map((p) => (
            <PlayerChip
              key={p.id}
              player={p}
              selected={p.id === hot.id}
              onClick={() => setHotId(p.id)}
              extra={history[p.id] ? <span className="small">🔥{history[p.id]}</span> : undefined}
            />
          ))}
        </div>
        <Button
          color="purple"
          onClick={() => {
            const others = players.filter((p) => p.id !== hot.id);
            const r = others[Math.floor(Math.random() * others.length)] ?? hot;
            setHotId(r.id);
            sfx.drumroll(0.5);
          }}
        >
          🎲 Zufall
        </Button>
        <div className="gx-hero gx-pop" key={hot.id}>
          <div className="avatar-big">{hot.avatar}</div>
          <div className="name">{hot.name}</div>
        </div>
        <p className="muted">
          2 Minuten Kreuzverhör. Jede verweigerte Antwort = {sips(PENALTY, drink)}.
        </p>
        <Button big block color="red" onClick={start}>
          🔥 Anheizen!
        </Button>
      </div>
    );
  }

  if (phase === 'summary') {
    const total = refused * PENALTY;
    return (
      <div className="screen centered center">
        <Confetti fire={confetti} />
        <div className="avatar-big gx-pop">{hot.avatar}</div>
        <h2>{refused === 0 ? 'Ehrlich wie a Beichtstuhl!' : refused >= 3 ? 'Oida, ein Geheimniskrämer!' : 'Überlebt!'}</h2>
        <div className="list" style={{ textAlign: 'left' }}>
          <div className="score-row">
            <span className="grow">🎤 Fragen gestellt</span>
            <span className="val">{asked}</span>
          </div>
          <div className="score-row">
            <span className="grow">✋ Verweigert</span>
            <span className="val">{refused}</span>
          </div>
          <div className="score-row">
            <span className="grow">🍺 Strafe gesamt</span>
            <span className="val">{total ? sips(total, drink) : '–'}</span>
          </div>
        </div>
        {total > 0 && <p className="muted small">Ist schon in der Statistik eingetragen. Prost, {hot.name}!</p>}
        <Button big block color="yellow" onClick={nextPerson}>
          Nächste Person ▶
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="row between">
        <PlayerChip player={hot} selected />
        <span className="pixel" style={{ fontSize: 10, color: 'var(--red)' }}>
          ✋ {refused}
        </span>
      </div>
      <div className={'gx-clock' + (timer.left <= 10 ? ' crit' : '')}>{mmss(timer.left)}</div>
      <TimerBar left={timer.left} total={SECONDS} />

      <div className={shake ? 'shake' : undefined} key={'s' + shake}>
        <PromptCard cardKey={asked} kicker={`🔥 Frage ${asked} an ${hot.name}`} text={q?.text ?? 'Keine Fragen mehr – denkt euch selber was aus!'} level={q?.l} color="#ff5f5f" />
      </div>

      <div className="grid2">
        <Button color="cyan" onClick={nextQ}>
          Nächste Frage ▶
        </Button>
        <Button color="red" silent onClick={refuse}>
          Verweigert ✋
        </Button>
      </div>
      <div className="row">
        <Button small color={timer.running ? 'ghost' : 'green'} onClick={() => (timer.running ? timer.stop() : timer.start(timer.left || SECONDS))}>
          {timer.running ? '⏸ Pause' : '▶ Weiter'}
        </Button>
        <Button small color="ghost" onClick={() => timer.addTime(30)} disabled={!timer.running}>
          +30s
        </Button>
        <div className="grow" />
        <Button small color="orange" onClick={finish}>
          Fertig 🏁
        </Button>
      </div>
    </div>
  );
}
