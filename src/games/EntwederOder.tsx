import { useEffect, useRef, useState } from 'react';
import { ENTWEDER_ODER } from '../data/entwederOder';
import type { Choice } from '../data/types';
import { useDeck, usePrompts } from '../lib/hooks';
import { useStore } from '../lib/store';
import { sips } from '../lib/format';
import { buzz, sfx } from '../lib/sound';
import { Button, LevelBadge } from '../components/ui';
import './mixSpiele.css';

type Phase = 'show' | 'count' | 'voted';

function Stepper({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: 'pink' | 'cyan' }) {
  return (
    <div className="col" style={{ alignItems: 'center', gap: 4 }}>
      <span className="pixel" style={{ fontSize: 10, color: `var(--${color})` }}>
        {label}
      </span>
      <div className="gx-stepper">
        <Button small color="ghost" onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </Button>
        <span className="v">{value}</span>
        <Button small color={color} onClick={() => onChange(Math.min(99, value + 1))}>
          +
        </Button>
      </div>
    </div>
  );
}

export default function EntwederOder() {
  const items = usePrompts(ENTWEDER_ODER);
  const draw = useDeck('entwederOder', items);
  const { settings, players } = useStore();
  const [card, setCard] = useState<Choice | undefined>(() => draw());
  const [n, setN] = useState(1);
  const [phase, setPhase] = useState<Phase>('show');
  const [count, setCount] = useState(3);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const next = () => {
    setCard(draw());
    setN((x) => x + 1);
    setPhase('show');
    setA(0);
    setB(0);
    sfx.card();
  };

  const vote = () => {
    setPhase('count');
    setCount(3);
    sfx.tick();
    buzz(30);
    [2, 1].forEach((v, i) =>
      timers.current.push(
        setTimeout(() => {
          setCount(v);
          sfx.tick();
          buzz(30);
        }, (i + 1) * 800),
      ),
    );
    timers.current.push(
      setTimeout(() => {
        setPhase('voted');
        sfx.buzzer();
        buzz([80, 40, 120]);
      }, 2400),
    );
  };

  if (!card) return <p className="center muted">Keine Fragen für diese Stufen.</p>;

  const total = a + b;
  const minority = total === 0 ? null : a === b ? 'tie' : a < b ? 'a' : 'b';
  const s1 = sips(1, settings.drinkMode);

  return (
    <div className="screen">
      <div className="row between">
        <span className="pixel muted" style={{ fontSize: 9 }}>
          FRAGE {n}
        </span>
        <LevelBadge l={card.l} />
      </div>
      <h2 className="center" style={{ margin: '4px 0' }}>
        Würdest du eher …
      </h2>
      <div className="gx-eo" key={n}>
        <div className={'gx-opt a' + (phase === 'voted' && (minority === 'a' || minority === 'tie') ? ' win' : '')}>
          <span className="lbl">A 👈</span>
          {card.a}
        </div>
        <div className="gx-or">ODER</div>
        <div className={'gx-opt b' + (phase === 'voted' && (minority === 'b' || minority === 'tie') ? ' win' : '')}>
          <span className="lbl">👉 B</span>
          {card.b}
        </div>
      </div>

      {phase === 'show' && (
        <Button big block color="yellow" onClick={vote}>
          Abstimmen! 3-2-1
        </Button>
      )}

      {phase === 'count' && (
        <div className="gx-count">
          <div key={count}>{count}</div>
        </div>
      )}

      {phase === 'voted' && (
        <>
          <div className="center pixel gx-pop" style={{ fontSize: 14, color: 'var(--yellow)' }}>
            JETZT ZEIGEN! 👈 A · B 👉
          </div>
          <div className="panel">
            <p className="small muted center" style={{ marginTop: 0 }}>
              Optional: Wie viele für A, wie viele für B?{players.length ? ` (${players.length} Leute)` : ''}
            </p>
            <div className="row" style={{ justifyContent: 'space-around' }}>
              <Stepper label="TEAM A" value={a} onChange={setA} color="pink" />
              <Stepper label="TEAM B" value={b} onChange={setB} color="cyan" />
            </div>
            {minority && (
              <div className="gx-stamp bad" key={minority} style={{ marginTop: 8 }}>
                {minority === 'tie' ? `Unentschieden – ALLE trinken ${s1}! 🍻` : `Minderheit Team ${minority.toUpperCase()} trinkt ${s1}! 🍺`}
              </div>
            )}
            {!minority && <p className="center small muted">Die Minderheit trinkt {s1}. Gleichstand? Alle!</p>}
          </div>
          <Button big block color="green" onClick={next}>
            Weiter ▶
          </Button>
        </>
      )}
      {phase === 'show' && (
        <Button block color="ghost" small onClick={next}>
          Überspringen ⏭
        </Button>
      )}
    </div>
  );
}
