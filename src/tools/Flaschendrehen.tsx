import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Confetti, Panel, Rich, Toggle } from '../components/ui';
import { useFill } from '../lib/hooks';
import { useStore } from '../lib/store';
import { buzz, sfx } from '../lib/sound';
import './tools.css';

type Phase = 'idle' | 'drag' | 'spin' | 'result';

/** Pixel-art bottle, neck pointing up. */
function Bottle() {
  const G = '#2fbf55';
  const D = '#1b7a35';
  const L = '#8dffb0';
  return (
    <svg viewBox="0 0 12 32" shapeRendering="crispEdges" aria-hidden>
      {/* outline */}
      <rect x="3" y="0" width="6" height="11" fill="#05020f" />
      <rect x="1" y="10" width="10" height="3" fill="#05020f" />
      <rect x="0" y="12" width="12" height="20" fill="#05020f" />
      {/* cap */}
      <rect x="4" y="0" width="4" height="2" fill="#ffe03a" />
      <rect x="4" y="2" width="4" height="1" fill="#b8860b" />
      {/* neck */}
      <rect x="4" y="3" width="4" height="8" fill={G} />
      <rect x="5" y="3" width="1" height="8" fill={L} />
      <rect x="7" y="3" width="1" height="8" fill={D} />
      {/* shoulder */}
      <rect x="2" y="11" width="8" height="2" fill={G} />
      <rect x="1" y="13" width="10" height="18" fill={G} />
      <rect x="9" y="13" width="2" height="18" fill={D} />
      <rect x="2" y="13" width="1" height="17" fill={L} />
      {/* label */}
      <rect x="1" y="18" width="10" height="7" fill="#fff4d6" />
      <rect x="1" y="19" width="10" height="1" fill="#ff2e88" />
      <rect x="1" y="23" width="10" height="1" fill="#ff2e88" />
      <rect x="4" y="21" width="4" height="1" fill="#2a1666" />
      {/* foam / shine */}
      <rect x="1" y="30" width="10" height="1" fill={D} />
    </svg>
  );
}

const norm = (a: number) => ((a % 360) + 360) % 360;

export default function Flaschendrehen() {
  const { players } = useStore();
  const fill = useFill();
  const nav = useNavigate();
  const [withPlayers, setWithPlayers] = useState(players.length >= 2);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hot, setHot] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [spins, setSpins] = useState(0);

  const usePl = withPlayers && players.length >= 2;
  const n = usePl ? players.length : 0;

  const arena = useRef<HTMLDivElement>(null);
  const bottle = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const omega = useRef(0);
  const raf = useRef(0);
  const lastT = useRef(0);
  const lastSector = useRef(0);
  const lastTick = useRef(0);
  const drag = useRef<{ last: number; samples: { a: number; t: number }[]; start: number; moved: number } | null>(null);
  const nRef = useRef(n);
  nRef.current = n;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const sectorSize = () => (nRef.current ? 360 / nRef.current : 30);
  const pointedIdx = (a: number) => (nRef.current ? Math.round(norm(a) / (360 / nRef.current)) % nRef.current : null);

  const apply = () => {
    if (bottle.current) bottle.current.style.transform = `rotate(${angle.current}deg)`;
    const sec = Math.floor((angle.current + sectorSize() / 2) / sectorSize());
    if (sec !== lastSector.current) {
      lastSector.current = sec;
      const now = performance.now();
      if (now - lastTick.current > 30) {
        lastTick.current = now;
        sfx.tick();
        if (Math.abs(omega.current) < 400) buzz(5);
      }
      const idx = pointedIdx(angle.current);
      setHot(idx);
    }
  };

  const finish = () => {
    cancelAnimationFrame(raf.current);
    omega.current = 0;
    setPhase('result');
    setSpins((s) => s + 1);
    setHot(pointedIdx(angle.current));
    sfx.fanfare();
    buzz([60, 40, 60, 40, 200]);
    setConfetti((c) => c + 1);
  };

  const step = (t: number) => {
    const dt = Math.min(0.05, (t - lastT.current) / 1000);
    lastT.current = t;
    const w = omega.current;
    // viskose + Gleitreibung: realistisches Auslaufen
    const dec = (0.45 * Math.abs(w) + 70) * dt;
    if (Math.abs(w) <= dec) {
      apply();
      finish();
      return;
    }
    omega.current = w - Math.sign(w) * dec;
    angle.current += omega.current * dt;
    apply();
    raf.current = requestAnimationFrame(step);
  };

  const spin = (w: number) => {
    cancelAnimationFrame(raf.current);
    omega.current = w;
    lastT.current = performance.now();
    setPhase('spin');
    sfx.whoosh();
    buzz(30);
    raf.current = requestAnimationFrame(step);
  };

  const spinButton = () => {
    const w = (900 + Math.random() * 900) * (Math.random() < 0.5 ? -1 : 1);
    spin(w);
  };

  const pointerAngle = (e: RPointerEvent) => {
    const r = arena.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(x, -y) * 180) / Math.PI;
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    arena.current?.setPointerCapture(e.pointerId);
    cancelAnimationFrame(raf.current);
    omega.current = 0;
    const a = pointerAngle(e);
    const t = performance.now();
    drag.current = { last: a, samples: [{ a: angle.current, t }], start: t, moved: 0 };
    setPhase('drag');
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const a = pointerAngle(e);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    d.moved += Math.abs(delta);
    angle.current += delta;
    const t = performance.now();
    d.samples.push({ a: angle.current, t });
    while (d.samples.length > 2 && t - d.samples[0].t > 90) d.samples.shift();
    apply();
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const t = performance.now();
    if (d.moved < 6 && t - d.start < 300) {
      spinButton(); // kurzer Tipp = drehen
      return;
    }
    const s0 = d.samples[0];
    const s1 = d.samples[d.samples.length - 1];
    const dt = (t - s0.t) / 1000;
    let w = dt > 0 ? (s1.a - s0.a) / Math.max(dt, 0.016) : 0;
    if (t - s1.t > 120) w = 0; // Finger stillgehalten vor dem Loslassen
    if (Math.abs(w) < 150) {
      setPhase('idle');
      return;
    }
    w = Math.sign(w) * Math.min(2800, Math.max(500, Math.abs(w)));
    spin(w);
  };

  const target = hot != null && usePl ? players[hot] : null;
  const R = 43;

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      {players.length >= 2 && phase !== 'spin' && <Toggle label="Mit Spielern" hint="Avatare im Kreis – die App weiß, wen’s erwischt" value={withPlayers} onChange={setWithPlayers} />}

      <div
        ref={arena}
        className="gt-arena"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="ring" />
        {usePl &&
          players.map((p, i) => {
            const a = ((i * 360) / n) * (Math.PI / 180);
            const isHot = hot === i && phase !== 'idle';
            return (
              <div
                key={p.id}
                className={'gt-seat' + (isHot ? ' hot' : '') + (isHot && phase === 'result' ? ' win' : '')}
                style={{ left: `${50 + R * Math.sin(a)}%`, top: `${50 - R * Math.cos(a)}%`, '--pc': p.color } as CSSProperties}
              >
                <span className="av">{p.avatar}</span>
                <span className="nm">{p.name}</span>
              </div>
            );
          })}
        <div ref={bottle} className="gt-bottle" style={{ transform: `rotate(${angle.current}deg)` }}>
          <Bottle />
        </div>
      </div>

      {phase === 'result' ? (
        <Panel glow="yellow" className="center gt-pop-in" key={spins}>
          {target ? (
            <>
              <div className="muted small">Die Flasche zeigt auf …</div>
              <div className="pixel" style={{ fontSize: 20, color: target.color, margin: '8px 0', textShadow: '3px 3px 0 var(--shadow)' }}>
                {target.avatar} {target.name}
              </div>
              <div className="grid2">
                <Button color="cyan" onClick={() => nav('/spiel/wahrheit-pflicht', { state: { playerId: target.id, choice: 'wahrheit' } })}>
                  😇 Wahrheit
                </Button>
                <Button color="pink" onClick={() => nav('/spiel/wahrheit-pflicht', { state: { playerId: target.id, choice: 'pflicht' } })}>
                  😈 Pflicht
                </Button>
              </div>
              <p className="muted small">
                <Rich text={fill('Oder ganz klassisch: Bussi, Frage – oder {s:2} und weiter.', target).text} />
              </p>
            </>
          ) : (
            <>
              <div className="pixel" style={{ fontSize: 14, color: 'var(--yellow)' }}>
                Die Flasche hat gesprochen!
              </div>
              <p>Wer vom Flaschenhals angepeilt wird, ist dran. Keine Diskussion!</p>
            </>
          )}
          <Button color="green" big block onClick={spinButton}>
            🔁 Nochmal
          </Button>
        </Panel>
      ) : (
        <>
          <p className="center muted small">{phase === 'spin' ? 'Dreht sich … Spannung! 🥁' : 'Flasche anwischen (im Kreis ziehen & loslassen) oder Knopf drücken.'}</p>
          <Button color="green" big block onClick={spinButton} disabled={phase === 'spin'}>
            🍾 Drehen!
          </Button>
        </>
      )}
      {players.length < 2 && <p className="muted small center">Tipp: Mit mindestens 2 Spielern in der Liste zeigt die App an, wen es erwischt hat.</p>}
    </div>
  );
}
