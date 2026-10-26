import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { WAHRHEIT } from '../data/wahrheit';
import { PFLICHT } from '../data/pflicht';
import { useCountdown, useDeck, useFill, usePrompts } from '../lib/hooks';
import { useStore } from '../lib/store';
import { sips } from '../lib/format';
import { buzz, sfx } from '../lib/sound';
import { Button, Confetti, PlayerChip, PromptCard, Seg, TimerBar } from '../components/ui';
import type { Level } from '../data/types';
import './mixSpiele.css';

type Kind = 'wahrheit' | 'pflicht';
interface Shown {
  kind: Kind;
  text: string;
  l: Level;
  secs: number | null;
  penalty: number;
  viaZufall: boolean;
}

const COWARD_LIMIT = 3;

export default function WahrheitPflicht() {
  const truths = usePrompts(WAHRHEIT, 'wahrheit');
  const dares = usePrompts(PFLICHT, 'pflicht');
  const drawTruth = useDeck('wahrheit', truths);
  const drawDare = useDeck('pflicht', dares);
  const fill = useFill();
  const { players, settings, addStat } = useStore();

  const [mode, setMode] = useState<'reihum' | 'zufall'>('reihum');
  // Flaschendrehen can hand over a player and a choice.
  const handover = useLocation().state as { playerId?: string; choice?: Kind } | null;
  const [idx, setIdx] = useState(() => Math.max(0, players.findIndex((p) => p.id === handover?.playerId)));
  const [shown, setShown] = useState<Shown | null>(null);
  const [rolling, setRolling] = useState<Kind | null>(null);
  const [result, setResult] = useState<null | 'done' | 'refused'>(null);
  const [counts, setCounts] = useState<Record<string, { w: number; p: number; streak: number }>>({});
  const [confetti, setConfetti] = useState(0);
  const [shake, setShake] = useState(0);
  const rollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (rollTimer.current) clearInterval(rollTimer.current);
  }, []);

  const timer = useCountdown(30, () => {
    sfx.buzzer();
    buzz([200, 80, 200]);
  }, { tick: true });

  const current = players[idx % Math.max(1, players.length)] ?? null;
  const c = current ? counts[current.id] ?? { w: 0, p: 0, streak: 0 } : { w: 0, p: 0, streak: 0 };
  const coward = c.streak >= COWARD_LIMIT;

  const choose = (kind: Kind, viaZufall = false) => {
    const card = kind === 'wahrheit' ? drawTruth() : drawDare();
    if (!card || !current) return;
    const m = /(\d+)\s*Sekunden/.exec(card.t);
    setShown({ kind, text: fill(card.t, current).text, l: card.l, secs: kind === 'pflicht' && m ? Number(m[1]) : null, viaZufall, penalty: Number(/\{s:(\d+)\}/.exec(card.t)?.[1] ?? 2) });
    setResult(null);
    timer.reset();
    setCounts((cs) => {
      const o = cs[current.id] ?? { w: 0, p: 0, streak: 0 };
      return {
        ...cs,
        [current.id]: kind === 'wahrheit' ? { w: o.w + 1, p: o.p, streak: viaZufall ? o.streak : o.streak + 1 } : { w: o.w, p: o.p + 1, streak: 0 },
      };
    });
    if (kind === 'pflicht') sfx.powerup();
    else sfx.card();
  };

  const handedOver = useRef(false);
  useEffect(() => {
    if (handedOver.current || !handover?.choice) return;
    handedOver.current = true;
    choose(handover.choice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zufall = () => {
    if (rolling) return;
    let k: Kind = 'wahrheit';
    let i = 0;
    setRolling(k);
    rollTimer.current = setInterval(() => {
      k = k === 'wahrheit' ? 'pflicht' : 'wahrheit';
      setRolling(k);
      sfx.tick();
      if (++i > 10 + Math.floor(Math.random() * 3)) {
        if (rollTimer.current) clearInterval(rollTimer.current);
        setRolling(null);
        buzz(60);
        choose(k, true);
      }
    }, 90);
  };

  const nextTurn = () => {
    timer.stop();
    setShown(null);
    setResult(null);
    if (!players.length) return;
    if (mode === 'zufall' && players.length > 1) {
      let j = idx;
      while (j === idx) j = Math.floor(Math.random() * players.length);
      setIdx(j);
    } else setIdx((i) => (i + 1) % players.length);
    sfx.whoosh();
  };

  const done = () => {
    if (!current) return;
    timer.stop();
    addStat(current.id, 'done');
    setResult('done');
    setConfetti((x) => x + 1);
    sfx.success();
  };
  const refused = () => {
    if (!current) return;
    timer.stop();
    addStat(current.id, 'refused');
    addStat(current.id, 'sips', shown?.penalty ?? 2);
    setResult('refused');
    setShake((x) => x + 1);
    sfx.fail();
    buzz([100, 50, 100]);
  };

  const drinkFor = (pNoAlc: boolean | undefined) => settings.drinkMode && !pNoAlc;

  if (!current) return null;

  return (
    <div className="screen">
      <Confetti fire={confetti} />

      {!shown && (
        <>
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { value: 'reihum', label: '🔁 Reihum' },
              { value: 'zufall', label: '🎲 Zufall' },
            ]}
          />
          <div className="gx-hero gx-pop" key={current.id + idx}>
            <div className="avatar-big">{current.avatar}</div>
            <div className="name">{current.name}</div>
            <div className="muted">ist dran! Was darf’s sein?</div>
          </div>

          <div className="gx-tod">
            <Button big block color="cyan" disabled={coward || !!rolling} onClick={() => choose('wahrheit')} style={rolling === 'wahrheit' ? { transform: 'scale(1.04)' } : undefined}>
              {coward ? '🐔 Feigling-Sperre' : '😇 Wahrheit'}
            </Button>
            <Button big block color="pink" disabled={!!rolling} onClick={() => choose('pflicht')} style={rolling === 'pflicht' ? { transform: 'scale(1.04)' } : undefined}>
              😈 Pflicht
            </Button>
            <Button block color="yellow" disabled={!!rolling} onClick={zufall}>
              {rolling ? (rolling === 'wahrheit' ? '… WAHRHEIT …' : '… PFLICHT …') : '🎲 Zufall'}
            </Button>
          </div>
          {coward && <div className="notice center">Oida! {COWARD_LIMIT}× hintereinander Wahrheit – jetzt gibt’s nur noch Pflicht (oder Zufall)!</div>}

          <h3>Feigling-Meter 🐔</h3>
          <div className="list">
            {players.map((p, i) => {
              const s = counts[p.id] ?? { w: 0, p: 0, streak: 0 };
              const tot = s.w + s.p;
              const pct = tot ? (s.w / tot) * 100 : 0;
              return (
                <div key={p.id} className="row" style={{ opacity: i === idx % players.length ? 1 : 0.75 }}>
                  <PlayerChip player={p} selected={i === idx % players.length} onClick={() => setIdx(i)} />
                  <div className="gx-meter">
                    <div style={{ width: pct + '%' }} />
                  </div>
                  <span className="small muted" style={{ minWidth: 70, textAlign: 'right' }}>
                    😇{s.w} 😈{s.p}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="muted small center">Tipp auf einen Namen, um direkt zu wählen.</p>
        </>
      )}

      {shown && (
        <>
          <div className={shake ? 'shake' : undefined} key={'s' + shake}>
            <PromptCard
              cardKey={shown.text}
              kicker={
                <span>
                  {shown.kind === 'wahrheit' ? '😇 Wahrheit' : '😈 Pflicht'} für {current.name}
                  {shown.viaZufall ? ' 🎲' : ''}
                </span>
              }
              text={shown.text}
              level={shown.l}
              color={shown.kind === 'wahrheit' ? '#19e3ff' : '#ff2e88'}
            />
          </div>

          {shown.secs && !result && (
            <div className="panel">
              {timer.running || timer.left === 0 ? (
                <>
                  <div className={'gx-timer-num' + (timer.left <= 5 ? ' pulse' : '')}>{timer.left === 0 ? 'ZEIT!' : timer.left + 's'}</div>
                  <TimerBar left={timer.left} total={shown.secs} />
                </>
              ) : (
                <Button block color="purple" onClick={() => timer.start(shown.secs!)}>
                  ⏱ {shown.secs} Sekunden starten
                </Button>
              )}
            </div>
          )}

          {!result && (
            <div className="grid2">
              <Button color="green" big silent onClick={done}>
                Erledigt ✔
              </Button>
              <Button color="red" big silent onClick={refused}>
                Gekniffen ✘
              </Button>
            </div>
          )}
          {result === 'done' && <div className="gx-stamp ok">Leiwand, {current.name}! 💪</div>}
          {result === 'refused' && (
            <div className="gx-stamp bad">
              Na servas! {current.name} nimmt {sips(shown.penalty, drinkFor(current.noAlcohol))} 🍺
            </div>
          )}
          {result && (
            <Button color="yellow" big block onClick={nextTurn}>
              Nächste Runde ▶
            </Button>
          )}
        </>
      )}
    </div>
  );
}
