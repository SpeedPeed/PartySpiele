import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Confetti, Panel, Rich, Seg, Toggle } from '../components/ui';
import { useFill } from '../lib/hooks';
import { useStore } from '../lib/store';
import { buzz, sfx } from '../lib/sound';
import './tools.css';

interface Contestant {
  id: string | null;
  name: string;
  avatar: string;
}

interface Result extends Contestant {
  time: number;
}

type Phase = 'ready' | 'running' | 'stopped' | 'end';

const TARGET = 10;
const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const fmtDiff = (d: number) => (d >= 0 ? '+' : '−') + fmt(Math.abs(d));

function verdict(d: number): { t: string; c: string } {
  const a = Math.abs(d);
  if (a <= 0.05) return { t: 'PERFEKT! Uhrwerk-Gehirn!', c: 'var(--green)' };
  if (a <= 0.2) return { t: 'Leiwand! Fast perfekt.', c: 'var(--green)' };
  if (a <= 0.5) return { t: 'Gar ned schlecht!', c: 'var(--cyan)' };
  if (a <= 1) return { t: 'Naja … passt scho.', c: 'var(--yellow)' };
  if (a <= 2) return { t: 'Oida, was war das?', c: 'var(--orange)' };
  return { t: 'Na servas – innere Uhr kaputt!', c: 'var(--red)' };
}

export default function ZehnSekunden() {
  const { players, settings, addStat } = useStore();
  const fill = useFill();
  const [anonCount, setAnonCount] = useState(4);
  const [hardcore, setHardcore] = useState(false);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [results, setResults] = useState<Result[]>([]);
  const [display, setDisplay] = useState(0);
  const [last, setLast] = useState<Result | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [paid, setPaid] = useState(false);
  const startRef = useRef(0);
  const raf = useRef(0);

  const contestants: Contestant[] = useMemo(
    () =>
      players.length
        ? players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }))
        : Array.from({ length: anonCount }, (_, i) => ({ id: null, name: `Spieler ${i + 1}`, avatar: ['👾', '🤖', '👽', '🐸', '🦊', '🐷', '🐼', '🦄'][i % 8] })),
    [players, anonCount],
  );
  const cur = contestants[idx] ?? contestants[0];

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const loop = () => {
    const t = (performance.now() - startRef.current) / 1000;
    setDisplay(t);
    raf.current = requestAnimationFrame(loop);
  };

  const press = () => {
    if (phase === 'ready') {
      startRef.current = performance.now();
      setDisplay(0);
      setPhase('running');
      sfx.select();
      buzz(30);
      raf.current = requestAnimationFrame(loop);
    } else if (phase === 'running') {
      const t = (performance.now() - startRef.current) / 1000;
      cancelAnimationFrame(raf.current);
      setDisplay(t);
      const r: Result = { ...cur, time: t };
      setLast(r);
      setResults((rs) => [...rs, r]);
      setPhase('stopped');
      const d = Math.abs(t - TARGET);
      if (d <= 0.05) {
        sfx.fanfare();
        buzz([80, 50, 80, 50, 200]);
        setConfetti((c) => c + 1);
      } else if (d <= 0.5) {
        sfx.success();
        buzz([40, 40, 40]);
      } else if (d > 2) {
        sfx.fail();
        buzz(300);
      } else {
        sfx.coin();
        buzz(60);
      }
    }
  };

  const next = () => {
    sfx.click();
    if (idx + 1 >= contestants.length) {
      setPhase('end');
      sfx.drumroll(1);
      window.setTimeout(() => {
        sfx.fanfare();
        setConfetti((c) => c + 1);
      }, 1000);
    } else {
      setIdx(idx + 1);
      setPhase('ready');
      setDisplay(0);
    }
  };

  const reset = () => {
    setIdx(0);
    setResults([]);
    setLast(null);
    setPhase('ready');
    setDisplay(0);
    setPaid(false);
  };

  const ranked = useMemo(() => results.slice().sort((a, b) => Math.abs(a.time - TARGET) - Math.abs(b.time - TARGET)), [results]);
  const worst = ranked[ranked.length - 1];
  const worstSips = worst ? Math.min(5, Math.max(1, Math.ceil(Math.abs(worst.time - TARGET)))) : 0;
  const perfects = results.filter((r) => Math.abs(r.time - TARGET) <= 0.05);

  const hidden = phase === 'running' && (hardcore || display > 3);

  if (phase === 'end') {
    const winner = ranked[0];
    return (
      <div className="screen">
        <Confetti fire={confetti} />
        <h2 className="center">🏁 Endstand der Runde</h2>
        <div className="list">
          {ranked.map((r, i) => (
            <div key={i} className="score-row gt-pop-in" style={{ animationDelay: i * 0.08 + 's', boxShadow: i === ranked.length - 1 ? '0 0 0 3px var(--red)' : undefined }}>
              <span className="rank">{i === 0 ? '👑' : `#${i + 1}`}</span>
              <span style={{ fontSize: 24 }}>{r.avatar}</span>
              <span className="grow">{r.name}</span>
              <span className="muted small">{fmt(r.time)} s</span>
              <span className="val" style={{ color: verdict(r.time - TARGET).c }}>
                {fmtDiff(r.time - TARGET)}
              </span>
            </div>
          ))}
        </div>
        {winner && (
          <Panel glow="yellow" className="center">
            <div className="muted small">Beste innere Uhr</div>
            <div className="pixel" style={{ fontSize: 14, color: 'var(--yellow)', margin: '6px 0' }}>
              {winner.avatar} {winner.name}
            </div>
            {perfects.length > 0 && (
              <p>
                <Rich text={fill(`🎯 Perfekt: ${perfects.map((p) => p.name).join(', ')} – darf {s:5} verteilen!`).text} />
              </p>
            )}
          </Panel>
        )}
        {worst && ranked.length > 1 && (
          <Panel glow="pink" className="center">
            <div className="muted small">Am weitesten daneben ({fmtDiff(worst.time - TARGET)} s)</div>
            <div style={{ fontSize: 30, margin: '6px 0' }}>
              <Rich text={fill(`{p} kassiert {s:${worstSips}}!`, null, { p: { id: worst.id ?? 'x', name: worst.name, avatar: worst.avatar, color: '', noAlcohol: false } }).text} />
            </div>
            {worst.id && (
              <Button
                color={paid ? 'ghost' : 'pink'}
                disabled={paid}
                onClick={() => {
                  if (worst.id) addStat(worst.id, 'sips', worstSips);
                  if (winner?.id && winner !== worst) addStat(winner.id, 'wins', 1);
                  setPaid(true);
                  sfx.coin();
                }}
              >
                {paid ? 'Eingetragen ✓' : settings.drinkMode ? '🍺 Getrunken – eintragen' : '⭐ Punkte eintragen'}
              </Button>
            )}
          </Panel>
        )}
        <Button color="yellow" big block onClick={reset}>
          🔁 Neue Runde
        </Button>
      </div>
    );
  }

  const v = last ? verdict(last.time - TARGET) : null;

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      {idx === 0 && phase === 'ready' && results.length === 0 && (
        <Panel>
          {players.length === 0 && (
            <>
              <div className="muted small">Keine Spielerliste – wie viele spielen anonym mit?</div>
              <Seg<number> value={anonCount} onChange={setAnonCount} options={[2, 3, 4, 5, 6, 8].map((n) => ({ value: n, label: String(n) }))} />
            </>
          )}
          <Toggle label="Hardcore-Modus" hint="Zeit ist von Anfang an versteckt" value={hardcore} onChange={setHardcore} />
        </Panel>
      )}

      <div className="row between">
        <span className="pixel" style={{ fontSize: 10, color: 'var(--muted)' }}>
          {idx + 1}/{contestants.length}
        </span>
        <span className="pixel" style={{ fontSize: 10, color: 'var(--cyan)' }}>
          ZIEL: 10,00 s
        </span>
      </div>

      <div className="center">
        <div className="avatar-big">{cur.avatar}</div>
        <div className="pixel" style={{ fontSize: 14, color: 'var(--yellow)', marginTop: 6 }}>
          {cur.name}
        </div>
        <div className="muted small">{phase === 'ready' ? 'du bist dran – zähl im Kopf mit!' : phase === 'running' ? 'zähl … 21, 22, 23 …' : ''}</div>
      </div>

      <div className={'gt-clock' + (hidden ? ' hidden' : '')}>{phase === 'ready' ? '0,00' : hidden ? '???' : fmt(display)}</div>

      {phase !== 'stopped' ? (
        <button
          className="gt-bigbtn"
          style={{ '--bc': phase === 'running' ? 'var(--red)' : 'var(--green)' } as CSSProperties}
          onPointerDown={(e) => {
            e.preventDefault();
            press();
          }}
        >
          {phase === 'running' ? 'STOPP' : 'START'}
        </button>
      ) : (
        last &&
        v && (
          <Panel glow={Math.abs(last.time - TARGET) <= 0.05 ? 'yellow' : 'cyan'} className="center gt-pop-in">
            <div className="pixel" style={{ fontSize: 24, color: v.c }}>
              {fmtDiff(last.time - TARGET)} s
            </div>
            <p style={{ fontSize: 28, margin: '8px 0' }}>{v.t}</p>
            {Math.abs(last.time - TARGET) <= 0.05 && (
              <p>
                <Rich text={fill('{p} darf {s:5} verteilen! 🎯', null, { p: { id: 'x', name: last.name, avatar: '', color: '', noAlcohol: false } }).text} />
              </p>
            )}
            <Button color="yellow" big block onClick={next}>
              {idx + 1 >= contestants.length ? '🏁 Auswertung' : `Weiter: ${contestants[idx + 1]?.name} ▶`}
            </Button>
          </Panel>
        )
      )}

      {ranked.length > 0 && (
        <>
          <h3>Bestenliste</h3>
          <div className="list">
            {ranked.map((r, i) => (
              <div key={i} className="score-row">
                <span className="rank">#{i + 1}</span>
                <span>{r.avatar}</span>
                <span className="grow">{r.name}</span>
                <span className="val" style={{ color: verdict(r.time - TARGET).c }}>
                  {fmtDiff(r.time - TARGET)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="muted small center">Am Ende kassiert, wer am weitesten daneben liegt: pro angefangene Sekunde Abweichung {settings.drinkMode ? 'ein Schluck' : 'ein Strafpunkt'} (max. 5).</p>
    </div>
  );
}
