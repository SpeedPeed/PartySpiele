import { useEffect, useRef, useState } from 'react';
import { REGELN } from '../data/regeln';
import { useDeck, useFill, usePrompts } from '../lib/hooks';
import { pick, uid } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { Button, Confetti, Rich } from '../components/ui';
import './mixSpiele.css';

const KEY = 'gaudi-hausregeln';

interface HouseRule {
  id: string;
  t: string;
}

function loadRules(): HouseRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is HouseRule => !!x && typeof x.t === 'string' && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

export default function RegelGenerator() {
  const items = usePrompts(REGELN, 'regeln');
  const draw = useDeck('regeln', items);
  const fill = useFill();

  const [rules, setRules] = useState<HouseRule[]>(loadRules);
  const [slot, setSlot] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [own, setOwn] = useState('');
  const [confetti, setConfetti] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(rules));
    } catch {
      /* storage blocked */
    }
  }, [rules]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const f = (t: string) => fill(t).text;

  const roll = () => {
    if (spinning || !items.length) return;
    setSpinning(true);
    setConfirmAll(false);
    const active = new Set(rules.map((r) => r.t));
    let final = draw();
    for (let k = 0; k < 10 && final && active.has(final.t); k++) final = draw();
    let delay = 50;
    let elapsed = 0;
    const step = () => {
      setSlot(pick(items).t);
      sfx.tick();
      elapsed += delay;
      delay *= 1.12;
      if (elapsed < 1700) timer.current = setTimeout(step, delay);
      else {
        const t = final?.t ?? pick(items).t;
        setSlot(t);
        setSpinning(false);
        setRules((rs) => [{ id: uid(), t }, ...rs]);
        setConfetti((c) => c + 1);
        sfx.coin();
        timer.current = setTimeout(() => sfx.fanfare(), 200);
        buzz([60, 40, 120]);
      }
    };
    step();
  };

  const remove = (id: string) => {
    setRules((rs) => rs.filter((r) => r.id !== id));
    sfx.whoosh();
    buzz(20);
  };

  const addOwn = () => {
    const t = own.trim();
    if (!t) return;
    setRules((rs) => [{ id: uid(), t }, ...rs]);
    setOwn('');
    sfx.select();
  };

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      <div className="gx-slot-lights">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className={'gx-slot' + (spinning ? ' spin' : slot ? ' hit' : '')}>
        <div key={spinning ? 'spin' : slot ?? 'leer'}>{slot ? <Rich text={f(slot)} /> : <span className="muted">🎰 Zieh am Hebel!</span>}</div>
      </div>
      <Button big block color="yellow" onClick={roll} disabled={spinning || !items.length}>
        {spinning ? '🎰 Rattert …' : '🎲 Neue Regel würfeln'}
      </Button>

      <div className="row between">
        <h2 style={{ margin: '8px 0' }}>📜 Aktiv: {rules.length}</h2>
        {rules.length > 0 &&
          (confirmAll ? (
            <Button
              small
              color="red"
              onClick={() => {
                setRules([]);
                setConfirmAll(false);
                setSlot(null);
                sfx.boom();
                buzz([100, 50, 200]);
              }}
            >
              Wirklich? Ja!
            </Button>
          ) : (
            <Button small color="ghost" onClick={() => setConfirmAll(true)}>
              Alle aufheben
            </Button>
          ))}
      </div>

      {rules.length === 0 && <p className="muted center">Noch keine Hausregeln. Anarchie! Würfelt euch eine aus.</p>}
      <div className="list">
        {rules.map((r, i) => (
          <div className="list-item gx-pop" key={r.id}>
            <span className="pixel" style={{ fontSize: 10, color: 'var(--yellow)', minWidth: 28 }}>
              #{rules.length - i}
            </span>
            <div className="grow">
              <Rich text={f(r.t)} />
            </div>
            <button className="iconbtn" aria-label="Regel aufheben" onClick={() => remove(r.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <h3>Eigene Regel dazuschreiben</h3>
      <div className="row">
        <input
          className="input"
          value={own}
          placeholder="z. B. Wer „Prost“ sagt, trinkt"
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addOwn()}
          maxLength={160}
        />
        <Button color="green" onClick={addOwn} disabled={!own.trim()}>
          +
        </Button>
      </div>
      <div style={{ height: 60 }} />
    </div>
  );
}
