import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, Confetti, Panel, PlayerChip, Rich, Seg } from '../components/ui';
import { useFill, useTurn } from '../lib/hooks';
import { useStore } from '../lib/store';
import { rand } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './tools.css';

type Tab = 'wuerfel' | 'trink' | 'muenze';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling, land, small, red }: { value: number; rolling?: boolean; land?: number; small?: boolean; red?: boolean }) {
  const on = PIPS[value] ?? [];
  return (
    <div key={land} className={['gt-die', small && 'sm', red && 'red', rolling ? 'rolling' : 'land'].filter(Boolean).join(' ')} aria-label={`Würfel zeigt ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={'pip' + (on.includes(i) ? ' on' : '')} />
      ))}
    </div>
  );
}

interface DrinkFace {
  e: string;
  t: string;
  /** Text, wenn eine Spielerliste existiert ({p} = wer gewürfelt hat) */
  tp: string;
  c: string;
}

const DRINK_FACES: DrinkFace[] = [
  { e: '🍺', t: 'Du trinkst {s:1}!', tp: '{p} trinkt {s:1}!', c: '#ff2e88' },
  { e: '👈', t: 'Links von dir trinkt {s:1}!', tp: 'Links von {p} trinkt {s:1}!', c: '#19e3ff' },
  { e: '👉', t: 'Rechts von dir trinkt {s:1}!', tp: 'Rechts von {p} trinkt {s:1}!', c: '#ffe03a' },
  { e: '🍻', t: 'Alle trinken {s:1}! Prost!', tp: 'Alle trinken {s:1}! Prost!', c: '#3dff6e' },
  { e: '🎁', t: 'Verteil {s:2}!', tp: '{p} verteilt {s:2}!', c: '#ff8a1f' },
  { e: '💧', t: 'Wasser! 💧 Ein Schluck Wasser für dich – Gesundheit!', tp: 'Wasser! 💧 {p} trinkt einen Schluck Wasser – Gesundheit!', c: '#5fa8ff' },
];

type Side = 'K' | 'Z';

/** Shake detection via DeviceMotion (with iOS permission request). */
function useShake(onShake: () => void) {
  const cb = useRef(onShake);
  cb.current = onShake;
  const [enabled, setEnabled] = useState(false);
  const [supported] = useState(() => typeof window !== 'undefined' && 'DeviceMotionEvent' in window);

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    let prev: { x: number; y: number; z: number } | null = null;
    const h = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const cur = { x: a.x, y: a.y, z: a.z };
      if (prev) {
        const d = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) + Math.abs(cur.z - prev.z);
        const now = Date.now();
        if (d > 28 && now - last > 1200) {
          last = now;
          cb.current();
        }
      }
      prev = cur;
    };
    window.addEventListener('devicemotion', h);
    return () => window.removeEventListener('devicemotion', h);
  }, [enabled]);

  const enable = useCallback(async () => {
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    try {
      if (DME?.requestPermission) {
        const r = await DME.requestPermission();
        if (r !== 'granted') return false;
      }
      setEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { enabled, supported, enable, disable: () => setEnabled(false) };
}

export default function Wuerfel() {
  const { players, settings } = useStore();
  const fill = useFill();
  const turn = useTurn();
  const [tab, setTab] = useState<Tab>('wuerfel');
  const [rolling, setRolling] = useState(false);
  const [land, setLand] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [shakeMsg, setShakeMsg] = useState('');

  // Würfel
  const [count, setCount] = useState(2);
  const [dice, setDice] = useState<number[]>([6, 6]);
  const [history, setHistory] = useState<number[]>([]);

  // Trinkwürfel
  const [face, setFace] = useState<number | null>(null);
  const [faceText, setFaceText] = useState('');
  const [faceRoll, setFaceRoll] = useState(0);
  const [roller, setRoller] = useState<string | null>(null);

  // Münze
  const [rot, setRot] = useState(0);
  const [side, setSide] = useState<Side | null>(null);
  const [flips, setFlips] = useState<Side[]>([]);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const rollDice = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    sfx.drumroll(0.7);
    buzz([20, 30, 20, 30, 20]);
    let n = 0;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      n++;
      setDice(Array.from({ length: count }, () => 1 + rand(6)));
      if (n % 2) sfx.tock();
      if (n >= 10) {
        window.clearInterval(timer.current);
        const final = Array.from({ length: count }, () => 1 + rand(6));
        setDice(final);
        setRolling(false);
        setLand((x) => x + 1);
        const sum = final.reduce((a, b) => a + b, 0);
        setHistory((h) => [sum, ...h].slice(0, 12));
        const pasch = count > 1 && final.every((v) => v === final[0]);
        if (pasch) {
          sfx.fanfare();
          buzz([60, 40, 120]);
          setConfetti((c) => c + 1);
        } else {
          sfx.coin();
          buzz(40);
        }
      }
    }, 70);
  }, [rolling, count]);

  const rollDrink = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    sfx.drumroll(0.8);
    buzz([20, 30, 20, 30, 20]);
    const who = players.length ? turn.current : null;
    let n = 0;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      n++;
      setFace(rand(DRINK_FACES.length));
      sfx.tick();
      if (n >= 11) {
        window.clearInterval(timer.current);
        const f = rand(DRINK_FACES.length);
        const df = DRINK_FACES[f];
        setFace(f);
        setFaceText(fill(who ? df.tp : df.t, who).text);
        setRoller(who?.id ?? null);
        setFaceRoll((x) => x + 1);
        setRolling(false);
        if (f === 3) {
          sfx.fanfare();
          setConfetti((c) => c + 1);
        } else if (f === 5) sfx.powerup();
        else sfx.success();
        buzz([50, 30, 80]);
        if (players.length) turn.next();
      }
    }, 75);
  }, [rolling, players.length, turn, fill]);

  const flipCoin = useCallback(() => {
    if (rolling) return;
    const r: Side = Math.random() < 0.5 ? 'K' : 'Z';
    setRolling(true);
    setSide(null);
    sfx.whoosh();
    buzz(30);
    setRot((prev) => {
      const base = Math.ceil(prev / 360) * 360 + 360 * 6;
      return base + (r === 'Z' ? 180 : 0);
    });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSide(r);
      setFlips((f) => [...f, r]);
      setRolling(false);
      sfx.coin();
      buzz([30, 40, 60]);
    }, 1600);
  }, [rolling]);

  const action = tab === 'wuerfel' ? rollDice : tab === 'trink' ? rollDrink : flipCoin;
  const actionRef = useRef(action);
  actionRef.current = action;
  const shake = useShake(() => {
    setShakeMsg('Geschüttelt!');
    actionRef.current();
  });

  const sum = dice.reduce((a, b) => a + b, 0);
  const pasch = !rolling && count > 1 && dice.every((v) => v === dice[0]);

  // Münz-Statistik
  const heads = flips.filter((f) => f === 'K').length;
  const tails = flips.length - heads;
  let streak = 0;
  for (let i = flips.length - 1; i >= 0 && flips[i] === flips[flips.length - 1]; i--) streak++;
  let best = 0;
  let run = 0;
  flips.forEach((f, i) => {
    run = i > 0 && flips[i - 1] === f ? run + 1 : 1;
    best = Math.max(best, run);
  });

  const df = face != null ? DRINK_FACES[face] : null;
  const rollerP = players.find((p) => p.id === roller);

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      <Seg<Tab>
        value={tab}
        onChange={(t) => !rolling && setTab(t)}
        options={[
          { value: 'wuerfel', label: '🎲 Würfel' },
          { value: 'trink', label: '🍺 Trinkwürfel' },
          { value: 'muenze', label: '🪙 Münze' },
        ]}
      />

      {tab === 'wuerfel' && (
        <>
          <div className="row between">
            <span className="muted small">Anzahl Würfel</span>
          </div>
          <Seg<number>
            value={count}
            color="var(--yellow)"
            onChange={(n) => {
              if (rolling) return;
              setCount(n);
              setDice(Array.from({ length: n }, (_, i) => dice[i] ?? 1 + rand(6)));
            }}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
          />
          <div className="gt-dice-row" onClick={rollDice} role="button" aria-label="Würfeln">
            {dice.map((v, i) => (
              <Die key={i} value={v} rolling={rolling} land={land} small={count > 3} red={i % 2 === 1} />
            ))}
          </div>
          <div className="center">
            {count > 1 && <div className="muted small">Summe</div>}
            <div className={'big-num' + (pasch ? ' pulse' : '')}>{rolling ? '…' : count > 1 ? sum : dice[0]}</div>
            {pasch && <div className="pixel" style={{ color: 'var(--green)', fontSize: 12, marginTop: 6 }}>★ PASCH! ★ Leiwand!</div>}
          </div>
          <Button color="yellow" big block onClick={rollDice} disabled={rolling}>
            {rolling ? 'Rollt …' : '🎲 Würfeln'}
          </Button>
          {history.length > 0 && (
            <div className="gt-hist">
              {history.map((h, i) => (
                <span key={i} style={{ background: i === 0 ? 'var(--yellow)' : 'var(--panel2)', color: i === 0 ? '#2a1600' : undefined }}>
                  {h}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'trink' && (
        <>
          {players.length > 0 && turn.current && (
            <div className="row center">
              <span className="muted small">Würfelt:</span>
              <PlayerChip player={turn.current} />
            </div>
          )}
          <div
            key={faceRoll}
            className={'gt-drinkdie ' + (rolling ? 'rolling' : 'land')}
            style={{ '--dc': df?.c ?? 'var(--purple)' } as CSSProperties}
            onClick={rollDrink}
            role="button"
          >
            <div className="e">{df ? df.e : '🎲'}</div>
            <div className="t">{rolling ? '???' : df ? 'TRINKWÜRFEL' : 'Tippen!'}</div>
          </div>
          {!rolling && df && (
            <Panel glow="pink" className="center">
              {rollerP && <div className="muted small">{rollerP.avatar} {rollerP.name} hat gewürfelt</div>}
              <div style={{ fontSize: 30, lineHeight: 1.15 }}>
                <Rich text={faceText} />
              </div>
            </Panel>
          )}
          <Button color="pink" big block onClick={rollDrink} disabled={rolling}>
            {rolling ? 'Rollt …' : '🍺 Trinkwürfel werfen'}
          </Button>
          <details className="muted small">
            <summary>Die 6 Seiten</summary>
            {DRINK_FACES.map((f, i) => (
              <div key={i}>
                {f.e} <Rich text={fill(f.t).text} />
              </div>
            ))}
            {!settings.drinkMode && <p>Alkoholfreier Modus: Strafpunkte statt Schlucke.</p>}
          </details>
        </>
      )}

      {tab === 'muenze' && (
        <>
          <div className="gt-coin-stage" onClick={flipCoin} role="button" aria-label="Münze werfen">
            <div
              className="gt-coin"
              style={{
                transform: `rotateY(${rot}deg) ${rolling ? 'translateY(-60px) scale(1.15)' : ''}`,
                transition: rolling ? 'transform 1.6s cubic-bezier(.25,.9,.35,1)' : 'transform .2s',
              }}
            >
              <div className="face">
                <span className="big">👑</span>KOPF
              </div>
              <div className="face back">
                <span className="big" style={{ fontFamily: 'var(--pixel)', fontSize: 52 }}>
                  1
                </span>
                ZAHL
              </div>
            </div>
          </div>
          <div className="gt-coin-shadow" />
          <div className="center" style={{ minHeight: 60 }}>
            {side && !rolling && (
              <div className="big-num gt-pop-in" style={{ fontSize: 32 }}>
                {side === 'K' ? 'KOPF!' : 'ZAHL!'}
              </div>
            )}
            {rolling && <div className="pixel muted pulse">fliegt …</div>}
          </div>
          <Button color="cyan" big block onClick={flipCoin} disabled={rolling}>
            🪙 Münze werfen
          </Button>
          {flips.length > 0 && (
            <Panel>
              <div className="grid3 center">
                <div>
                  <div className="pixel" style={{ fontSize: 16, color: 'var(--yellow)' }}>{heads}</div>
                  <div className="muted small">Kopf ({Math.round((heads / flips.length) * 100)}%)</div>
                </div>
                <div>
                  <div className="pixel" style={{ fontSize: 16, color: 'var(--cyan)' }}>{tails}</div>
                  <div className="muted small">Zahl ({Math.round((tails / flips.length) * 100)}%)</div>
                </div>
                <div>
                  <div className="pixel" style={{ fontSize: 16, color: 'var(--pink)' }}>{best}×</div>
                  <div className="muted small">längste Serie</div>
                </div>
              </div>
              <p className="center small">
                Aktuelle Serie: <b>{streak}× {flips[flips.length - 1] === 'K' ? 'Kopf' : 'Zahl'}</b>
                {streak >= 4 && ' – Oida, das ist kein Zufall mehr!'}
              </p>
              <div className="gt-hist">
                {flips.slice(-20).map((f, i) => (
                  <span key={i} style={{ background: f === 'K' ? 'var(--yellow)' : 'var(--cyan)', color: '#0a0420' }}>
                    {f}
                  </span>
                ))}
              </div>
              <div className="center">
                <Button small color="ghost" onClick={() => setFlips([])}>
                  Statistik löschen
                </Button>
              </div>
            </Panel>
          )}
        </>
      )}

      {shake.supported && (
        <div className="center">
          {shake.enabled ? (
            <p className="ok-notice small" onClick={shake.disable}>
              📳 Schütteln aktiv – Handy schütteln zum {tab === 'muenze' ? 'Werfen' : 'Würfeln'}! {shakeMsg && <b>({shakeMsg})</b>}
            </p>
          ) : (
            <Button
              small
              color="ghost"
              onClick={async () => {
                const ok = await shake.enable();
                if (!ok) setShakeMsg('Kein Zugriff auf Bewegungssensor');
                else sfx.powerup();
              }}
            >
              📳 Schütteln zum Würfeln aktivieren
            </Button>
          )}
          {!shake.enabled && shakeMsg && <p className="muted small">{shakeMsg}</p>}
        </div>
      )}
    </div>
  );
}
