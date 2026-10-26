import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Confetti, Seg } from '../components/ui';
import { WER_BIN_ICH } from '../data/werBinIch';
import { useCountdown } from '../lib/hooks';
import { getDeck } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './arcadeGames.css';

type Phase = 'setup' | 'countdown' | 'play' | 'result';
interface Res {
  w: string;
  ok: boolean | null;
}

const MIX = '__mix';

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* nicht unterstützt (z. B. iOS) – wir drehen den Inhalt selbst */
  }
}

function exitFullscreen() {
  try {
    (screen.orientation as unknown as { unlock?: () => void }).unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

/** Querformat-Bühne: dreht den Inhalt im Hochformat um 90°. */
function Landscape({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const { w, h } = useViewport();
  const portrait = h > w;
  const style: CSSProperties = portrait
    ? { width: h, height: w, top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(90deg)' }
    : { inset: 0 };
  return (
    <div className={'ga-forehead' + (className ? ' ' + className : '')} onClick={onClick}>
      <div className="ga-forehead-inner" style={style}>
        {children}
      </div>
    </div>
  );
}

function termSize(text: string, width: number) {
  const longest = Math.max(...text.split(/\s+/).map((x) => x.length), 1);
  const avail = width - 60;
  return Math.max(20, Math.min(64, Math.floor(avail / (longest * 1.05)), text.length > 24 ? 34 : 64));
}

export default function WerBinIch() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [catId, setCatId] = useState<string>(MIX);
  const [secs, setSecs] = useState(90);
  const [count, setCount] = useState(3);
  const [word, setWord] = useState('');
  const [flash, setFlash] = useState<'' | 'ok' | 'pass'>('');
  const [results, setResults] = useState<Res[]>([]);
  const [tilt, setTilt] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [confetti, setConfetti] = useState(0);
  const { w, h } = useViewport();
  const landscapeW = Math.max(w, h);

  const cat = WER_BIN_ICH.find((c) => c.id === catId);
  const pool = useMemo(() => (cat ? cat.words : WER_BIN_ICH.flatMap((c) => c.words)), [cat]);

  const live = useRef({ phase, word, flash, tilt });
  live.current = { phase, word, flash, tilt };

  const nextWord = useCallback(() => {
    const d = getDeck('werbinich-' + catId, pool);
    setWord(d.draw() ?? '???');
  }, [catId, pool]);

  const finish = useCallback(() => {
    const { word: wd, flash: fl } = live.current;
    setResults((r) => (fl ? r : [...r, { w: wd, ok: null }]));
    setFlash('');
    setPhase('result');
    sfx.buzzer();
    buzz(600);
    exitFullscreen();
  }, []);

  const timer = useCountdown(secs, finish, { tick: true });

  const mark = useCallback(
    (ok: boolean) => {
      const { phase: ph, word: wd, flash: fl } = live.current;
      if (ph !== 'play' || fl) return;
      setResults((r) => [...r, { w: wd, ok }]);
      setFlash(ok ? 'ok' : 'pass');
      if (ok) {
        sfx.success();
        buzz(80);
      } else {
        sfx.whoosh();
        buzz([30, 40, 30]);
      }
      setTimeout(() => {
        if (live.current.phase !== 'play') return;
        setFlash('');
        nextWord();
      }, 850);
    },
    [nextWord],
  );

  // Countdown 3-2-1
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      setResults([]);
      nextWord();
      setPhase('play');
      timer.start(secs);
      sfx.powerup();
      buzz(120);
      return;
    }
    sfx.tick();
    buzz(30);
    const t = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  // Kippen per Lagesensor
  useEffect(() => {
    // Auch ohne erteilte Erlaubnis lauschen – kommen keine Events, bleibt einfach das Tippen.
    if (phase !== 'play') return;
    let armed = false;
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (live.current.tilt !== 'on') setTilt('on');
      const b = (e.beta * Math.PI) / 180;
      const g = (e.gamma * Math.PI) / 180;
      // z-Komponente des "Oben"-Vektors im Gerät: >0 Bildschirm zeigt nach oben, <0 nach unten
      const z = Math.cos(b) * Math.cos(g);
      if (Math.abs(z) < 0.4) {
        armed = true;
        return;
      }
      if (!armed || live.current.flash) return;
      if (z < -0.62) {
        armed = false;
        mark(true);
      } else if (z > 0.62) {
        armed = false;
        mark(false);
      }
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [phase, mark]);

  useEffect(() => () => exitFullscreen(), []);

  // Jubel bei guter Runde
  const goodRound = phase === 'result' && results.filter((r) => r.ok).length >= 5;
  useEffect(() => {
    if (!goodRound) return;
    const t = setTimeout(() => {
      sfx.fanfare();
      setConfetti((c) => c + 1);
    }, 700);
    return () => clearTimeout(t);
  }, [goodRound]);

  const start = async () => {
    sfx.select();
    const DOE = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    if (DOE?.requestPermission) {
      try {
        const r = await DOE.requestPermission();
        setTilt(r === 'granted' ? 'on' : 'off');
      } catch {
        setTilt('off');
      }
    } else setTilt(DOE ? 'on' : 'off');
    void enterFullscreen();
    setCount(3);
    setFlash('');
    setPhase('countdown');
  };

  const abort = () => {
    timer.stop();
    finish();
  };

  // ---------- Render ----------
  if (phase === 'countdown') {
    return (
      <Landscape>
        <div className="ga-kicker" style={{ fontSize: 14, marginBottom: 12 }}>
          📱 Handy an die Stirn!
        </div>
        <div className="ga-countdown" key={count}>
          {count > 0 ? count : 'LOS!'}
        </div>
        <p className="muted" style={{ fontSize: 22 }}>
          {tilt === 'on' ? 'Runter kippen = richtig · Hoch kippen = Pass' : 'Rechts tippen = richtig · Links tippen = Pass'}
        </p>
      </Landscape>
    );
  }

  if (phase === 'play') {
    const correct = results.filter((r) => r.ok).length;
    const shown = flash === 'ok' ? 'RICHTIG!' : flash === 'pass' ? 'PASS' : word;
    return (
      <Landscape className={flash || undefined}>
        <div className="ga-forehead-timer" style={{ color: timer.left <= 10 ? 'var(--red)' : undefined }}>
          ⏱ {timer.left}s
        </div>
        <div className="ga-forehead-score">✔ {correct}</div>
        <div className={'ga-term' + (flash ? ' ga-pop' : '')} key={shown} style={{ fontSize: termSize(shown, landscapeW) }}>
          {shown}
        </div>
        {!flash && (
          <div className="ga-tapzones">
            <div onClick={() => mark(false)}>◀ PASS</div>
            <div onClick={() => mark(true)}>RICHTIG ▶</div>
          </div>
        )}
        <button
          className="iconbtn"
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}
          onClick={(e) => {
            e.stopPropagation();
            abort();
          }}
          aria-label="Runde beenden"
        >
          ✕
        </button>
      </Landscape>
    );
  }

  if (phase === 'result') {
    const correct = results.filter((r) => r.ok).length;
    const passed = results.filter((r) => r.ok === false).length;
    return (
      <div className="screen">
        <Confetti fire={confetti} />
        <div className="center ga-pop">
          <div className="ga-kicker">Zeit aus! Ergebnis</div>
          <div className="big-num">{correct}</div>
          <div className="pixel" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {correct === 1 ? 'PUNKT' : 'PUNKTE'} · {passed} PASS
          </div>
          <p>{correct >= 10 ? 'Wahnsinn, a Hirn wie a Lexikon!' : correct >= 5 ? 'Leiwand gemacht!' : 'Naja… nächstes Mal mehr Konzentration, gell?'}</p>
        </div>
        <div className="list">
          {results.map((r, i) => (
            <div className="list-item" key={i} style={{ padding: '6px 10px', color: r.ok ? 'var(--green)' : r.ok === false ? 'var(--orange)' : 'var(--muted)' }}>
              <span style={{ width: 28 }}>{r.ok ? '✔' : r.ok === false ? '⏭' : '⌛'}</span>
              <span className="grow">{r.w}</span>
            </div>
          ))}
          {!results.length && <p className="muted center">Kein einziger Begriff? Oida.</p>}
        </div>
        <Button
          color="green"
          big
          block
          onClick={() => void start()}
        >
          🔁 Nächste Person
        </Button>
        <Button color="ghost" block onClick={() => setPhase('setup')}>
          Kategorie ändern
        </Button>
      </div>
    );
  }

  // Setup
  return (
    <div className="screen">
      <div className="center">
        <div className="avatar-big">🤔</div>
        <div className="ga-title">WER BIN ICH?</div>
      </div>
      <h2>Kategorie</h2>
      <div className="ga-cat-grid">
        <button
          className={'ga-cat' + (catId === MIX ? ' sel' : '')}
          onClick={() => {
            sfx.click();
            setCatId(MIX);
          }}
        >
          <span className="e">🎲</span>
          <span>Mix aus allem</span>
        </button>
        {WER_BIN_ICH.map((c) => (
          <button
            key={c.id}
            className={'ga-cat' + (catId === c.id ? ' sel' : '')}
            onClick={() => {
              sfx.click();
              setCatId(c.id);
            }}
          >
            <span className="e">{c.emoji}</span>
            <span>{c.name}</span>
            <span className="small" style={{ opacity: 0.7 }}>
              {c.words.length} Begriffe
            </span>
          </button>
        ))}
      </div>
      <h2>Rundendauer</h2>
      <Seg
        options={[
          { value: 60, label: '60 s' },
          { value: 90, label: '90 s' },
          { value: 120, label: '120 s' },
        ]}
        value={secs}
        onChange={setSecs}
        color="var(--green)"
      />
      <div className="panel small">
        📱 Handy <b>quer</b> an die Stirn halten, Bildschirm zu den anderen.
        <br />
        ⬇ Runter kippen = <span style={{ color: 'var(--green)' }}>richtig</span> · ⬆ Hoch kippen = <span style={{ color: 'var(--orange)' }}>Pass</span>
        <br />
        👆 Oder tippen: rechte Hälfte richtig, linke Hälfte Pass.
      </div>
      <Button color="green" big block onClick={() => void start()}>
        ▶ Start
      </Button>
    </div>
  );
}
