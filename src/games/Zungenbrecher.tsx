import { useEffect, useMemo, useRef, useState } from 'react';
import { ZUNGENBRECHER } from '../data/zungenbrecher';
import type { Prompt } from '../data/types';
import { useDeck, useFill, usePrompts } from '../lib/hooks';
import { useStore } from '../lib/store';
import { sips } from '../lib/format';
import { buzz, sfx } from '../lib/sound';
import { Button, Confetti, PlayerChip, PromptCard } from '../components/ui';
import './mixSpiele.css';

const PENALTY = 1;

export default function Zungenbrecher() {
  const items = usePrompts(ZUNGENBRECHER);
  const draw = useDeck('zungenbrecher', items);
  const fill = useFill();
  const { players, settings, addStat } = useStore();

  const [card, setCard] = useState<Prompt | undefined>(() => draw());
  const [n, setN] = useState(1);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<null | 'ok' | 'bad'>(null);
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  const [confetti, setConfetti] = useState(0);
  const [shake, setShake] = useState(0);
  // Stoppuhr
  const [watch, setWatch] = useState<{ start: number; ms: number; running: boolean }>({ start: 0, ms: 0, running: false });
  const [record, setRecord] = useState<{ ms: number; who: string } | null>(null);
  const raf = useRef(0);

  const current = players.length ? players[idx % players.length] : null;

  const text = useMemo(() => (card ? fill(card.t, current).text : ''), [card, current, fill]);

  useEffect(() => {
    if (!watch.running) return;
    const loop = () => {
      setWatch((w) => ({ ...w, ms: performance.now() - w.start }));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [watch.running]);

  const stopWatch = () => {
    if (!watch.running) return watch.ms;
    const ms = performance.now() - watch.start;
    setWatch({ start: watch.start, ms, running: false });
    return ms;
  };

  const toggleWatch = () => {
    if (watch.running) stopWatch();
    else {
      setWatch({ start: performance.now(), ms: 0, running: true });
      sfx.select();
    }
  };

  const next = () => {
    setCard(draw());
    setN((x) => x + 1);
    setResult(null);
    setWatch({ start: 0, ms: 0, running: false });
    if (players.length) setIdx((i) => (i + 1) % players.length);
    sfx.card();
  };

  const ok = () => {
    const ms = stopWatch();
    if (current) addStat(current.id, 'done');
    setTally((t) => ({ ...t, ok: t.ok + 1 }));
    setResult('ok');
    setConfetti((c) => c + 1);
    sfx.success();
    if (ms > 0 && (!record || ms < record.ms)) setRecord({ ms, who: current?.name ?? 'Jemand' });
  };
  const bad = () => {
    stopWatch();
    if (current) addStat(current.id, 'sips', PENALTY);
    setTally((t) => ({ ...t, bad: t.bad + 1 }));
    setResult('bad');
    setShake((s) => s + 1);
    sfx.fail();
    buzz([80, 40, 80]);
  };

  if (!card) return <p className="center muted">Keine Zungenbrecher für diese Stufen.</p>;
  const secs = (watch.ms / 1000).toFixed(2).replace('.', ',');

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      {current && (
        <div className="row between">
          <PlayerChip player={current} selected />
          <span className="muted small">ist dran!</span>
        </div>
      )}
      <div className={shake ? 'shake' : undefined} key={'s' + shake}>
        <PromptCard cardKey={n} kicker="👅 3× schnell hintereinander!" text={text} level={card.l} color="#a64dff" />
      </div>

      <div className="row">
        <Button color={watch.running ? 'orange' : 'purple'} onClick={toggleWatch} disabled={!!result}>
          {watch.running ? '⏹ Stopp' : '⏱ Stoppuhr'}
        </Button>
        <div className="grow pixel center" style={{ fontSize: 20, color: watch.running ? 'var(--yellow)' : 'var(--muted)' }}>
          {secs}s
        </div>
      </div>
      {record && (
        <p className="small muted center" style={{ margin: 0 }}>
          🏅 Rekord: {(record.ms / 1000).toFixed(2).replace('.', ',')} s von {record.who}
        </p>
      )}

      {!result && (
        <div className="grid2">
          <Button big color="green" silent onClick={ok}>
            Geschafft ✔
          </Button>
          <Button big color="red" silent onClick={bad}>
            Verhaspelt 🤪
          </Button>
        </div>
      )}
      {result === 'ok' && <div className="gx-stamp ok">Leiwand! Zunge aus Stahl! 💪</div>}
      {result === 'bad' && (
        <div className="gx-stamp bad">
          Verhaspelt! {current ? `${current.name} nimmt ` : 'Nimm '}
          {sips(PENALTY, settings.drinkMode && !current?.noAlcohol)} 🍺
        </div>
      )}

      <Button color="yellow" block big onClick={next}>
        Nächster Zungenbrecher ▶
      </Button>
      <p className="muted small center">
        Karte {n} · ✔ {tally.ok} · 🤪 {tally.bad}
      </p>
    </div>
  );
}
