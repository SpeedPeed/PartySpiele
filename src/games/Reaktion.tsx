import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { useStore } from '../lib/store';
import { sips } from '../lib/format';
import { buzz, sfx } from '../lib/sound';
import { Button, Confetti, PlayerPicker, Seg } from '../components/ui';
import './mixSpiele.css';

type Phase = 'setup' | 'ready' | 'wait' | 'go' | 'result' | 'final';

interface Contestant {
  name: string;
  color: string;
  avatar: string;
  playerId?: string;
  noAlcohol?: boolean;
}

interface Zone {
  ready: boolean;
  time: number | null;
  foul: boolean;
}

interface RoundResult {
  winner: number | null;
  penalties: Record<number, { n: number; why: string }>;
}

const ZONE_COLORS = ['#ff2e88', '#19e3ff', '#ffe03a', '#3dff6e'];
const ZONE_AV = ['🔴', '🔵', '🟡', '🟢'];
const FOUL_PEN = 2;
const SLOW_PEN = 1;
const SLEEP_PEN = 2;
const GO_TIMEOUT = 3000;

const emptyZones = (n: number): Zone[] => Array.from({ length: n }, () => ({ ready: false, time: null, foul: false }));

export default function Reaktion() {
  const { players, settings, addStat } = useStore();
  const [count, setCount] = useState(2);
  const [source, setSource] = useState<'liste' | 'anonym'>(players.length >= 2 ? 'liste' : 'anonym');
  const [picked, setPicked] = useState<string[]>(() => players.slice(0, 2).map((p) => p.id));
  const [roundsTotal, setRoundsTotal] = useState(5);

  const [phase, setPhaseState] = useState<Phase>('setup');
  const [cont, setCont] = useState<Contestant[]>([]);
  const [zones, setZonesState] = useState<Zone[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [res, setRes] = useState<RoundResult | null>(null);
  const [confetti, setConfetti] = useState(0);

  const phaseRef = useRef<Phase>('setup');
  const zonesRef = useRef<Zone[]>([]);
  const goAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const contRef = useRef<Contestant[]>([]);
  contRef.current = cont;

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const setZones = (z: Zone[]) => {
    zonesRef.current = z;
    setZonesState(z);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => clearTimers, []);

  const pickFromList = source === 'liste' && players.length >= 2;
  const canStart = !pickFromList || picked.length === count;

  const togglePick = (id: string) => {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const nxt = [...cur, id];
      return nxt.length > count ? nxt.slice(nxt.length - count) : nxt;
    });
  };

  const startGame = () => {
    const c: Contestant[] = pickFromList
      ? picked.map((id) => players.find((p) => p.id === id)!).filter(Boolean).map((p) => ({ name: p.name, color: p.color, avatar: p.avatar, playerId: p.id, noAlcohol: p.noAlcohol }))
      : Array.from({ length: count }, (_, i) => ({ name: `Spieler ${i + 1}`, color: ZONE_COLORS[i], avatar: ZONE_AV[i] }));
    setCont(c);
    setScores(c.map(() => 0));
    setRound(1);
    startRound(c.length);
    sfx.powerup();
  };

  const startRound = (n: number) => {
    clearTimers();
    setRes(null);
    setZones(emptyZones(n));
    setPhase('ready');
  };

  const finishRound = () => {
    if (phaseRef.current === 'result') return;
    clearTimers();
    const z = zonesRef.current;
    const c = contRef.current;
    const valid = z.map((x, i) => ({ i, t: x.time })).filter((x): x is { i: number; t: number } => x.t !== null && !z[x.i].foul);
    valid.sort((a, b) => a.t - b.t);
    const winner = valid.length ? valid[0].i : null;
    const penalties: RoundResult['penalties'] = {};
    let anyFoul = false;
    z.forEach((x, i) => {
      if (x.foul) {
        penalties[i] = { n: FOUL_PEN, why: 'Fehlstart' };
        anyFoul = true;
      } else if (x.time === null) penalties[i] = { n: SLEEP_PEN, why: 'eingeschlafen' };
    });
    if (!anyFoul && Object.keys(penalties).length === 0 && valid.length >= 2) {
      penalties[valid[valid.length - 1].i] = { n: SLOW_PEN, why: 'am langsamsten' };
    }
    Object.entries(penalties).forEach(([i, p]) => {
      const pid = c[Number(i)]?.playerId;
      if (pid) addStat(pid, 'sips', p.n);
    });
    if (winner !== null) {
      setScores((s) => s.map((v, i) => (i === winner ? v + 1 : v)));
      setConfetti((x) => x + 1);
      sfx.fanfare();
      buzz([50, 30, 50, 30, 150]);
    } else {
      sfx.fail();
      buzz([200, 80, 200]);
    }
    setRes({ winner, penalties });
    setPhase('result');
  };

  const beginWait = () => {
    setPhase('wait');
    sfx.select();
    buzz(30);
    const delay = 2000 + Math.random() * 4000;
    later(() => {
      if (phaseRef.current !== 'wait') return;
      goAt.current = performance.now();
      setPhase('go');
      sfx.coin();
      buzz(120);
      later(finishRound, GO_TIMEOUT);
    }, delay);
  };

  const onDown = (i: number, e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const ph = phaseRef.current;
    const z = zonesRef.current.slice();
    const cur = z[i];
    if (!cur) return;
    if (ph === 'ready') {
      if (cur.ready) return;
      z[i] = { ...cur, ready: true };
      setZones(z);
      sfx.click();
      buzz(15);
      if (z.every((x) => x.ready)) later(beginWait, 700);
    } else if (ph === 'wait') {
      if (cur.foul) return;
      z[i] = { ...cur, foul: true };
      setZones(z);
      sfx.buzzer();
      buzz([100, 50, 100]);
      if (z.every((x) => x.foul)) finishRound();
    } else if (ph === 'go') {
      if (cur.foul || cur.time !== null) return;
      z[i] = { ...cur, time: Math.round(performance.now() - goAt.current) };
      setZones(z);
      sfx.click();
      if (z.every((x) => x.foul || x.time !== null)) {
        clearTimers();
        later(finishRound, 250);
      }
    }
  };

  const nextRound = () => {
    if (round >= roundsTotal) {
      setPhase('final');
      const best = Math.max(...scores);
      scores.forEach((s, i) => {
        if (s === best && best > 0 && cont[i]?.playerId) addStat(cont[i].playerId!, 'wins');
      });
      setConfetti((x) => x + 1);
      sfx.fanfare();
      return;
    }
    setRound((r) => r + 1);
    startRound(cont.length);
  };

  const quit = () => {
    clearTimers();
    setPhase('setup');
  };

  const pen = (c: Contestant | undefined, n: number) => sips(n, settings.drinkMode && !c?.noAlcohol);

  // ---------------- Setup ----------------
  if (phase === 'setup') {
    return (
      <div className="screen">
        <div className="center">
          <div className="avatar-big pulse">⚡</div>
          <h1 style={{ color: 'var(--yellow)' }}>REAKTIONS-DUELL</h1>
          <p className="muted">Bis zu 4 Finger, ein Handy. Grün = tippen! Zu früh = Fehlstart.</p>
        </div>
        <h3>Wie viele spielen?</h3>
        <Seg
          value={count}
          onChange={(v) => {
            setCount(v);
            setPicked((cur) => cur.slice(0, v));
          }}
          options={[2, 3, 4].map((v) => ({ value: v, label: `${v} Spieler` }))}
        />
        {players.length >= 2 && (
          <>
            <h3>Wer tritt an?</h3>
            <Seg
              value={source}
              onChange={setSource}
              options={[
                { value: 'liste', label: '👥 Aus Spielerliste' },
                { value: 'anonym', label: '🎭 Anonym' },
              ]}
            />
            {source === 'liste' && (
              <>
                <PlayerPicker selected={picked} onToggle={togglePick} />
                <p className="small muted">
                  {picked.length}/{count} gewählt
                </p>
              </>
            )}
          </>
        )}
        <h3>Runden</h3>
        <Seg value={roundsTotal} onChange={setRoundsTotal} options={[3, 5, 10].map((v) => ({ value: v, label: `${v}` }))} />
        <div className="panel small">
          ▸ Fehlstart: {sips(FOUL_PEN, settings.drinkMode)}
          <br />▸ Langsamste Person: {sips(SLOW_PEN, settings.drinkMode)}
          <br />▸ Gar nicht getippt: {sips(SLEEP_PEN, settings.drinkMode)}
        </div>
        <Button big block color="yellow" disabled={!canStart} onClick={startGame}>
          ⚡ Los geht’s!
        </Button>
      </div>
    );
  }

  // ---------------- Endstand ----------------
  if (phase === 'final') {
    const order = cont.map((c, i) => ({ c, s: scores[i] ?? 0 })).sort((a, b) => b.s - a.s);
    const best = order[0]?.s ?? 0;
    return (
      <div className="screen centered center">
        <Confetti fire={confetti} />
        <div className="avatar-big gx-pop">🏆</div>
        <h2>Endstand nach {roundsTotal} Runden</h2>
        <div className="list" style={{ textAlign: 'left' }}>
          {order.map(({ c, s }, i) => (
            <div className="score-row" key={c.name} style={{ boxShadow: `0 0 0 3px var(--shadow), inset 6px 0 0 ${c.color}` }}>
              <span className="rank">{s === best && best > 0 ? '👑' : `#${i + 1}`}</span>
              <span className="grow">
                {c.avatar} {c.name}
              </span>
              <span className="val">{s}</span>
            </div>
          ))}
        </div>
        <p>{best > 0 ? `${order.filter((o) => o.s === best).map((o) => o.c.name).join(' & ')} – schnellste Finger im Wilden Westen! 🤠` : 'Niemand hat gewonnen. Peinlich, Oida.'}</p>
        <Button
          big
          block
          color="yellow"
          onClick={() => {
            setScores(cont.map(() => 0));
            setRound(1);
            startRound(cont.length);
          }}
        >
          🔁 Revanche
        </Button>
        <Button block color="ghost" onClick={quit}>
          Neu aufsetzen
        </Button>
      </div>
    );
  }

  // ---------------- Spielfeld ----------------
  const n = cont.length;
  const flipIdx = n === 2 ? [0] : [0, 1];
  const ranks = (() => {
    const t = zones.map((z, i) => ({ i, t: z.time })).filter((x) => x.t !== null && !zones[x.i].foul) as { i: number; t: number }[];
    t.sort((a, b) => a.t - b.t);
    const r: Record<number, number> = {};
    t.forEach((x, k) => (r[x.i] = k + 1));
    return r;
  })();

  return (
    <>
      <Confetti fire={phase === 'result' && res?.winner != null ? confetti : 0} />
      <div className={`gx-rx n${n} ${phase}`} onContextMenu={(e) => e.preventDefault()}>
        {cont.map((c, i) => {
          const z = zones[i] ?? { ready: false, time: null, foul: false };
          const cls = ['gx-zone', flipIdx.includes(i) && 'flip', phase === 'ready' && z.ready && 'ready', z.foul && 'foul', z.time !== null && !z.foul && phase !== 'result' && 'done', phase === 'result' && res?.winner === i && 'best']
            .filter(Boolean)
            .join(' ');
          let main = '';
          let sub = '';
          if (phase === 'ready') {
            main = z.ready ? 'BEREIT ✔' : 'TIPP MICH';
            sub = z.ready ? 'Warte auf die anderen …' : 'Finger bereit halten!';
          } else if (phase === 'wait') {
            main = z.foul ? 'FEHLSTART!' : 'WARTE …';
            sub = z.foul ? '🚫 Zu früh, Oida!' : 'Noch nicht …';
          } else if (phase === 'go') {
            main = z.foul ? 'FEHLSTART!' : z.time !== null ? `${z.time} ms` : 'JETZT!!';
            sub = z.time !== null ? '✔' : '';
          } else if (phase === 'result') {
            const p = res?.penalties[i];
            main = z.foul ? 'FEHLSTART' : z.time !== null ? `${z.time} ms` : '💤 —';
            sub = res?.winner === i ? '🏆 Sieg! +1' : p ? `${p.why}: ${pen(c, p.n)} 🍺` : ranks[i] ? `Platz ${ranks[i]}` : '';
          }
          return (
            <div key={i} className={cls} style={{ '--zc': c.color } as CSSProperties} onPointerDown={(e) => onDown(i, e)}>
              <div className="gx-zin">
                <div className="zn">
                  {c.avatar} {c.name} · {scores[i] ?? 0} 🏆
                </div>
                <div className="zt">{main}</div>
                {sub && <div className="zs">{sub}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {(phase === 'ready' || phase === 'wait' || phase === 'go') && (
        <button className="gx-rx-quit" onClick={quit} aria-label="Beenden">
          ✕
        </button>
      )}

      {phase === 'result' && (
        <div className="gx-rx-center">
          <div className="pixel muted" style={{ fontSize: 9 }}>
            RUNDE {round}/{roundsTotal}
          </div>
          <div className="gx-rx-banner" style={{ margin: '8px 0', color: res?.winner != null ? cont[res.winner]?.color : 'var(--red)' }}>
            {res?.winner != null ? `${cont[res.winner].name} gewinnt!` : 'Alle verkackt!'}
          </div>
          <Button block color="yellow" onClick={nextRound}>
            {round >= roundsTotal ? 'Endstand 🏆' : 'Nächste Runde ▶'}
          </Button>
          <Button block small color="ghost" onClick={quit}>
            Beenden
          </Button>
        </div>
      )}
    </>
  );
}
