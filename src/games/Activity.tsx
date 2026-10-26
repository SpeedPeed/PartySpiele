import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, Confetti, Seg, TimerBar } from '../components/ui';
import { ACTIVITY_WORDS } from '../data/activity';
import { useCountdown } from '../lib/hooks';
import { getDeck, pick } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './arcadeGames.css';

type Phase = 'setup' | 'turn' | 'rolling' | 'choose' | 'secret' | 'play' | 'result' | 'winner';
type Diff = 1 | 2 | 3;

const MODES = [
  { id: 'zeichnen', emoji: '✏️', name: 'Zeichnen', hint: 'Nur zeichnen – keine Buchstaben, keine Zahlen, nicht reden!' },
  { id: 'erklaeren', emoji: '🗣️', name: 'Erklären', hint: 'Mit Worten umschreiben – das Wort selbst und Teile davon sind verboten!' },
  { id: 'pantomime', emoji: '🕺', name: 'Pantomime', hint: 'Nur Körpersprache – kein Ton, nicht auf Gegenstände zeigen!' },
] as const;
type Mode = (typeof MODES)[number];

const BY_DIFF: Record<Diff, typeof ACTIVITY_WORDS> = {
  1: ACTIVITY_WORDS.filter((w) => w.d === 1),
  2: ACTIVITY_WORDS.filter((w) => w.d === 2),
  3: ACTIVITY_WORDS.filter((w) => w.d === 3),
};

const TEAM_COLORS = ['#ff2e88', '#19e3ff', '#3dff6e', '#ffe03a'];
const DEFAULT_NAMES = ['Team Rot', 'Team Blau', 'Team Grün', 'Team Gelb'];
const DIFF_LABEL: Record<Diff, string> = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };
const ROUND_SECS = 60;

function Board({ names, points, target, active }: { names: string[]; points: number[]; target: number; active: number }) {
  const cols = Math.min(target, 15);
  return (
    <div className="panel ga-board" style={{ padding: 10 }}>
      {names.map((n, t) => (
        <div className="ga-board-row" key={t} style={{ '--tc': TEAM_COLORS[t], opacity: active === -1 || active === t ? 1 : 0.6 } as CSSProperties}>
          <div className="ga-board-name" style={{ color: TEAM_COLORS[t] }}>
            {active === t ? '▶' : ''}
            {n}
          </div>
          <div className="ga-cells" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: target }, (_, i) => (
              <div key={i} className={'ga-cell' + (i < points[t] ? (i === points[t] - 1 ? ' on head' : ' on') : '')} />
            ))}
          </div>
          <div className="pixel" style={{ fontSize: 9, width: 22, textAlign: 'right' }}>
            {points[t]}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Activity() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [target, setTarget] = useState(15);
  const [points, setPoints] = useState<number[]>([0, 0, 0, 0]);
  const [team, setTeam] = useState(0);
  const [mode, setMode] = useState<Mode>(MODES[0]);
  const [slot, setSlot] = useState<string>('🎲');
  const [diff, setDiff] = useState<Diff>(1);
  const [word, setWord] = useState('');
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  const [confetti, setConfetti] = useState(0);
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeNames = names.slice(0, count);
  const activePoints = points.slice(0, count);

  const timer = useCountdown(
    ROUND_SECS,
    () => {
      sfx.buzzer();
      buzz([400, 100, 400]);
    },
    { tick: true },
  );

  useEffect(
    () => () => {
      if (spinRef.current) clearInterval(spinRef.current);
    },
    [],
  );

  const startGame = () => {
    setPoints([0, 0, 0, 0]);
    setTeam(0);
    setPhase('turn');
    sfx.select();
  };

  const roll = () => {
    setPhase('rolling');
    const final = pick(MODES);
    let i = 0;
    spinRef.current = setInterval(() => {
      i++;
      setSlot(MODES[i % MODES.length].emoji);
      sfx.tick();
    }, 85);
    setTimeout(() => {
      if (spinRef.current) clearInterval(spinRef.current);
      spinRef.current = null;
      setSlot(final.emoji);
      setMode(final);
      setPhase('choose');
      sfx.select();
      buzz(60);
    }, 1500);
  };

  const choose = (d: Diff) => {
    setDiff(d);
    const pool = BY_DIFF[d].length ? BY_DIFF[d] : ACTIVITY_WORDS;
    setWord(getDeck('activity-' + d, pool).draw()?.w ?? '???');
    setOpen(false);
    setPhase('secret');
    sfx.card();
  };

  const go = () => {
    setPeek(false);
    setPhase('play');
    timer.start(ROUND_SECS);
    sfx.powerup();
  };

  const resolve = (ok: boolean) => {
    timer.stop();
    setWon(ok);
    if (ok) {
      const np = points.slice();
      np[team] = Math.min(target, np[team] + diff);
      setPoints(np);
      sfx.success();
      buzz(80);
      if (np[team] >= target) {
        setTimeout(() => {
          setPhase('winner');
          setConfetti((c) => c + 1);
          sfx.fanfare();
          buzz([100, 50, 100, 50, 300]);
        }, 900);
      }
    } else {
      sfx.fail();
      buzz([150, 60, 150]);
    }
    setPhase('result');
  };

  const nextTeam = () => {
    setTeam((t) => (t + 1) % count);
    setSlot('🎲');
    setPhase('turn');
    sfx.whoosh();
  };

  const teamName = activeNames[team];
  const teamStyle: CSSProperties = { color: TEAM_COLORS[team], textShadow: '3px 3px 0 var(--shadow)' };

  if (phase === 'setup') {
    return (
      <div className="screen">
        <div className="center">
          <div className="avatar-big">🎭</div>
          <div className="ga-title">ACTIVITY</div>
        </div>
        <h2>Anzahl Teams</h2>
        <Seg options={[2, 3, 4].map((v) => ({ value: v, label: `${v} Teams` }))} value={count} onChange={setCount} color="var(--orange)" />
        {activeNames.map((n, t) => (
          <div key={t} className="row">
            <span style={{ width: 16, height: 40, background: TEAM_COLORS[t], boxShadow: '0 0 0 3px var(--shadow)' }} />
            <input className="input" value={n} maxLength={20} onChange={(e) => setNames((ns) => ns.map((x, i) => (i === t ? e.target.value : x)))} />
          </div>
        ))}
        <h2>Zielpunkte</h2>
        <Seg options={[10, 15, 20, 30].map((v) => ({ value: v, label: String(v) }))} value={target} onChange={setTarget} color="var(--yellow)" />
        <div className="panel small">
          {MODES.map((m) => (
            <div key={m.id}>
              {m.emoji} <b>{m.name}</b>: {m.hint}
            </div>
          ))}
        </div>
        <Button color="orange" big block onClick={startGame}>
          ▶ Spiel starten
        </Button>
      </div>
    );
  }

  if (phase === 'winner') {
    const w = activePoints.indexOf(Math.max(...activePoints));
    return (
      <div className="screen centered center">
        <Confetti fire={confetti} />
        <div className="avatar-big ga-pop">🏆</div>
        <div className="ga-kicker">Am Ziel!</div>
        <div className="ga-title xl" style={{ color: TEAM_COLORS[w], textShadow: '4px 4px 0 var(--shadow)' }}>
          {activeNames[w]}
        </div>
        <p style={{ fontSize: 26 }}>gewinnt mit {activePoints[w]} Punkten. Leiwand, Prost! 🍻</p>
        <Board names={activeNames} points={activePoints} target={target} active={w} />
        <Button color="green" big block onClick={startGame}>
          🔁 Nochmal
        </Button>
        <Button color="ghost" block onClick={() => setPhase('setup')}>
          Teams ändern
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <Board names={activeNames} points={activePoints} target={target} active={team} />

      {phase === 'turn' && (
        <div className="col center">
          <div className="ga-kicker">Dran ist</div>
          <div className="ga-title ga-pop" key={team} style={teamStyle}>
            {teamName}
          </div>
          <p className="muted">Wer stellt dar? Ausmachen und dann würfeln!</p>
          <div className="ga-slot">
            <span>{slot}</span>
          </div>
          <Button color="yellow" big block onClick={roll}>
            🎲 Würfeln
          </Button>
        </div>
      )}

      {phase === 'rolling' && (
        <div className="col center">
          <div className="ga-kicker">Darstellungsart…</div>
          <div className="ga-slot spin">
            <span>{slot}</span>
          </div>
        </div>
      )}

      {phase === 'choose' && (
        <div className="col center">
          <div className="ga-slot">
            <span className="ga-pop">{mode.emoji}</span>
          </div>
          <div className="ga-title ga-pop">{mode.name.toUpperCase()}!</div>
          <p className="muted small">{mode.hint}</p>
          <h3>Schwierigkeit wählen</h3>
          <div className="grid3">
            {([1, 2, 3] as Diff[]).map((d) => (
              <Button key={d} color={d === 1 ? 'green' : d === 2 ? 'yellow' : 'red'} onClick={() => choose(d)}>
                {DIFF_LABEL[d]}
                <br />
                {d} Pkt
              </Button>
            ))}
          </div>
        </div>
      )}

      {phase === 'secret' && (
        <div className="col center">
          <div className="ga-kicker">
            {mode.emoji} {mode.name} · {DIFF_LABEL[diff]} ({diff} Pkt)
          </div>
          <p className="notice">🙈 Nur die darstellende Person schaut hin!</p>
          <div
            className={'ga-secret' + (open ? ' open' : '')}
            onClick={() => {
              sfx.card();
              setOpen((o) => !o);
            }}
          >
            {open ? (
              <div className="pixel ga-pop" style={{ fontSize: word.length > 14 ? 16 : 22, color: 'var(--yellow)', lineHeight: 1.5 }}>
                {word}
              </div>
            ) : (
              <div className="pixel" style={{ fontSize: 11 }}>
                👆 ANTIPPEN ZUM AUFDECKEN
              </div>
            )}
          </div>
          <Button color="green" big block onClick={go}>
            ⏱ Start ({ROUND_SECS} s)
          </Button>
        </div>
      )}

      {phase === 'play' && (
        <div className="col center">
          <div className="row between">
            <span className="pixel" style={{ fontSize: 10, ...teamStyle }}>
              {teamName}
            </span>
            <span className="pixel" style={{ fontSize: 18, color: timer.left <= 10 ? 'var(--red)' : 'var(--yellow)' }}>
              {timer.left}s
            </span>
          </div>
          <TimerBar left={timer.left} total={ROUND_SECS} />
          <div style={{ fontSize: 80 }} className={timer.running ? 'pulse' : undefined}>
            {mode.emoji}
          </div>
          <div
            className={'ga-secret' + (peek ? ' open' : '')}
            style={{ minHeight: 90 }}
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
          >
            {peek ? (
              <div className="pixel" style={{ fontSize: 18, color: 'var(--yellow)' }}>
                {word}
              </div>
            ) : (
              <div className="pixel" style={{ fontSize: 9 }}>
                GEDRÜCKT HALTEN ZUM SPICKEN
              </div>
            )}
          </div>
          {!timer.running && timer.left === 0 && <div className="notice">⏰ Zeit aus! Wurde es noch rechtzeitig erraten?</div>}
          <div className="grid2">
            <Button color="green" big onClick={() => resolve(true)} silent>
              ✔ Erraten
            </Button>
            <Button color="red" big onClick={() => resolve(false)} silent>
              ✘ Nicht
            </Button>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="col center">
          <div className={'ga-result ' + (won ? 'ok' : 'bad')}>
            <div className="ga-big">{won ? `+${diff} PUNKT${diff > 1 ? 'E' : ''}!` : 'LEIDER NEIN!'}</div>
            <p>
              Der Begriff war: <b>{word}</b>
            </p>
            <p>{won ? `${teamName} rückt vor – leiwand!` : 'Keine Punkte. Oida, das war doch eindeutig!'}</p>
          </div>
          <Button color="yellow" big block onClick={nextTeam}>
            Weiter an {activeNames[(team + 1) % count]} ▶
          </Button>
        </div>
      )}
    </div>
  );
}
