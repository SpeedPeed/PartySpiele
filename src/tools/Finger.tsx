import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { Button, Confetti, Seg } from '../components/ui';
import { shuffle, pick } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './tools.css';

type Mode = 'one' | 'teams' | 'order';
type Phase = 'wait' | 'count' | 'result';

interface Dot {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  color: string;
  mouse: boolean;
  team?: number;
  order?: number;
}

const DOT_COLORS = ['#ff2e88', '#19e3ff', '#ffe03a', '#3dff6e', '#ff8a1f', '#a64dff', '#ff5f5f', '#7fffd4', '#f0f', '#c0ff3e', '#5fa8ff', '#ffb3d9'];
const TEAMS = [
  { c: '#ff3b3b', n: 'ROT', l: 'A' },
  { c: '#19e3ff', n: 'BLAU', l: 'B' },
  { c: '#3dff6e', n: 'GRÜN', l: 'C' },
];
const STILL_MS = 2500;
const COUNT_MS = 1500;

export default function Finger() {
  const [mode, setMode] = useState<Mode>('one');
  const [teamCount, setTeamCount] = useState(2);
  const [phase, setPhase] = useState<Phase>('wait');
  const [, setVersion] = useState(0);
  const [count, setCount] = useState(3);
  const [winner, setWinner] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(0);

  const area = useRef<HTMLDivElement>(null);
  const dots = useRef(new Map<number, Dot>());
  const active = useRef(new Set<number>());
  const lastChange = useRef(0);
  const countStart = useRef(0);
  const resultAt = useRef(0);
  const mouseId = useRef(-1);
  const countRef = useRef(3);
  const phaseRef = useRef<Phase>('wait');
  phaseRef.current = phase;
  const cfg = useRef({ mode, teamCount });
  cfg.current = { mode, teamCount };

  const rerender = () => setVersion((v) => v + 1);

  const changed = () => {
    lastChange.current = performance.now();
    if (phaseRef.current === 'count') {
      setPhase('wait');
      sfx.fail();
    }
  };

  const reset = () => {
    dots.current.clear();
    active.current.clear();
    setWinner(null);
    setPhase('wait');
    lastChange.current = performance.now();
    rerender();
  };

  const decide = () => {
    const list = [...dots.current.values()];
    if (list.length < 2) {
      setPhase('wait');
      return;
    }
    const { mode: m, teamCount: k } = cfg.current;
    resultAt.current = performance.now();
    if (m === 'one') {
      const w = pick(list);
      setWinner(w.id);
      sfx.fanfare();
      buzz([100, 50, 100, 50, 300]);
      setConfetti((c) => c + 1);
    } else if (m === 'teams') {
      const sh = shuffle(list);
      // Teamgrößen möglichst gleich, Teams zufällig verteilt
      sh.forEach((d, i) => (d.team = i % k));
      sfx.success();
      buzz([60, 40, 60]);
    } else {
      shuffle(list).forEach((d, i) => (d.order = i + 1));
      sfx.fanfare();
      buzz([60, 40, 60, 40, 120]);
      setConfetti((c) => c + 1);
    }
    setPhase('result');
    rerender();
  };

  useEffect(() => {
    const iv = window.setInterval(() => {
      const now = performance.now();
      const p = phaseRef.current;
      if (p === 'wait' && dots.current.size >= 2 && now - lastChange.current >= STILL_MS) {
        countStart.current = now;
        countRef.current = 3;
        setCount(3);
        setPhase('count');
        sfx.tick();
        buzz(30);
      } else if (p === 'count') {
        const el = now - countStart.current;
        const c = 3 - Math.floor(el / (COUNT_MS / 3));
        if (el >= COUNT_MS) decide();
        else if (countRef.current !== c) {
          countRef.current = c;
          setCount(c);
          sfx.tick();
          buzz(30);
        }
      }
    }, 50);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: RPointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const freeColor = () => {
    const used = new Set([...dots.current.values()].map((d) => d.color));
    return DOT_COLORS.find((c) => !used.has(c)) ?? DOT_COLORS[dots.current.size % DOT_COLORS.length];
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, .gt-finger-top')) return;
    e.preventDefault();
    if (phaseRef.current === 'result') {
      // Neue Runde, sobald alle Finger weg sind
      if (active.current.size === 0 && performance.now() - resultAt.current > 700) reset();
      else return;
    }
    const { x, y } = pos(e);
    if (e.pointerType === 'mouse') {
      // Desktop-Test: Klick = Punkt setzen, Klick auf Punkt = entfernen
      const hit = [...dots.current.values()].find((d) => d.mouse && Math.hypot(d.x - x, d.y - y) < 60);
      if (hit) {
        dots.current.delete(hit.id);
        sfx.tock();
      } else {
        const id = mouseId.current--;
        dots.current.set(id, { id, x, y, sx: x, sy: y, color: freeColor(), mouse: true });
        sfx.select();
      }
      changed();
      rerender();
      return;
    }
    try {
      area.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    active.current.add(e.pointerId);
    dots.current.set(e.pointerId, { id: e.pointerId, x, y, sx: x, sy: y, color: freeColor(), mouse: false });
    sfx.select();
    buzz(20);
    changed();
    rerender();
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dots.current.get(e.pointerId);
    if (!d || d.mouse || phaseRef.current === 'result') return;
    const { x, y } = pos(e);
    d.x = x;
    d.y = y;
    if (Math.hypot(x - d.sx, y - d.sy) > 14) {
      d.sx = x;
      d.sy = y;
      changed();
    }
    rerender();
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    active.current.delete(e.pointerId);
    if (phaseRef.current === 'result') {
      rerender();
      return;
    }
    if (dots.current.delete(e.pointerId)) {
      sfx.tock();
      changed();
      rerender();
    }
  };

  const list = [...dots.current.values()];
  const win = winner != null ? dots.current.get(winner) : undefined;
  const bg = phase === 'result' && mode === 'one' && win ? win.color : phase === 'count' ? '#1d0f4a' : 'transparent';

  let hint = '';
  if (phase === 'wait') hint = list.length === 0 ? 'Alle einen Finger aufs Display!' : list.length === 1 ? 'Mindestens 2 Finger …' : 'Stillhalten …';

  const teamSizes = mode === 'teams' && phase === 'result' ? TEAMS.slice(0, teamCount).map((_, i) => list.filter((d) => d.team === i).length) : [];

  return (
    <div
      ref={area}
      className="gt-finger-area"
      style={{ background: bg }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Confetti fire={confetti} />
      {list.length === 0 && phase === 'wait' && (
        <div className="gt-finger-top col">
          <Seg<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'one', label: '👑 1 Gewinner' },
              { value: 'teams', label: '👥 Teams' },
              { value: 'order', label: '🔢 Reihenfolge' },
            ]}
          />
          {mode === 'teams' && (
            <Seg<number>
              value={teamCount}
              onChange={setTeamCount}
              color="var(--green)"
              options={[
                { value: 2, label: '2 Teams' },
                { value: 3, label: '3 Teams' },
              ]}
            />
          )}
        </div>
      )}

      {phase === 'wait' && (
        <div className="gt-finger-hint">
          {list.length === 0 && <div className="avatar-big pulse">☝️</div>}
          <div className="pixel" style={{ fontSize: 12, color: 'var(--yellow)', opacity: list.length ? 0.6 : 1 }}>
            {hint}
          </div>
          {list.length === 0 && <div className="muted small">Am PC: Klicken setzt Punkte (nochmal klicken entfernt).</div>}
        </div>
      )}
      {phase === 'count' && (
        <div className="gt-finger-hint">
          <div className="gt-countdown" key={count}>
            {count}
          </div>
        </div>
      )}

      {list.map((d) => {
        const gone = phase === 'result' && mode === 'one' && d.id !== winner;
        const isWin = phase === 'result' && mode === 'one' && d.id === winner;
        const color = d.team != null && phase === 'result' ? TEAMS[d.team].c : isWin ? '#fff' : d.color;
        const label = phase === 'result' ? (mode === 'order' ? d.order : mode === 'teams' && d.team != null ? TEAMS[d.team].l : isWin ? '👑' : '') : '';
        return (
          <div
            key={d.id}
            className={'gt-dot' + (phase === 'count' ? ' fast' : '') + (gone ? ' gone' : '') + (isWin ? ' winner' : '')}
            style={{ left: d.x, top: d.y, '--fc': color } as CSSProperties}
          >
            {label}
          </div>
        );
      })}

      {phase === 'result' && (
        <div className="gt-finger-hint" style={{ justifyContent: 'flex-end', paddingBottom: 40 }}>
          <div className="pixel gt-pop-in" style={{ fontSize: 14, color: mode === 'one' ? '#0a0420' : 'var(--yellow)', textShadow: mode === 'one' ? '2px 2px 0 #fff' : '3px 3px 0 var(--pink)' }}>
            {mode === 'one' ? 'DU BIST DRAN!' : mode === 'teams' ? 'TEAMS STEHEN!' : 'DIE REIHENFOLGE!'}
          </div>
          {mode === 'teams' && (
            <div className="row center wrap">
              {teamSizes.map((s, i) => (
                <span key={i} className="badge" style={{ '--bc': TEAMS[i].c, color: '#0a0420' } as CSSProperties}>
                  {TEAMS[i].l} = {TEAMS[i].n} ({s})
                </span>
              ))}
            </div>
          )}
          <div style={{ pointerEvents: 'auto' }}>
            <Button color={mode === 'one' ? 'ghost' : 'yellow'} onClick={reset}>
              🔁 Nochmal
            </Button>
          </div>
          <div className="muted small" style={{ color: mode === 'one' ? '#0a0420' : undefined }}>
            Finger weg & neu antippen startet auch neu
          </div>
        </div>
      )}
    </div>
  );
}
