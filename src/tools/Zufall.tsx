import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, Confetti, Panel, Seg, Toggle } from '../components/ui';
import { useStore } from '../lib/store';
import { between, pick, shuffle } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './tools.css';

type Tab = 'person' | 'teams' | 'reihe' | 'zahl';

interface Entry {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

const TEAM_STYLE = [
  { name: 'Team Rot', c: '#ff5f5f', e: '🔴' },
  { name: 'Team Blau', c: '#19e3ff', e: '🔵' },
  { name: 'Team Gelb', c: '#ffe03a', e: '🟡' },
  { name: 'Team Grün', c: '#3dff6e', e: '🟢' },
  { name: 'Team Lila', c: '#a64dff', e: '🟣' },
  { name: 'Team Orange', c: '#ff8a1f', e: '🟠' },
];

/** Slot-machine: shows random candidates with increasing delays, then lands on the final one. */
function useSlot<T>() {
  const [shown, setShown] = useState<T | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [doneKey, setDoneKey] = useState(0);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);

  const spin = (candidates: () => T, final: T, onDone?: () => void) => {
    window.clearTimeout(t.current);
    setSpinning(true);
    let delay = 45;
    let steps = 0;
    const step = () => {
      steps++;
      if (delay > 330) {
        setShown(final);
        setSpinning(false);
        setDoneKey((k) => k + 1);
        onDone?.();
        return;
      }
      setShown(candidates());
      if (steps % 2 === 0) sfx.tick();
      else sfx.tock();
      delay *= steps < 14 ? 1.04 : 1.16;
      t.current = window.setTimeout(step, delay);
    };
    step();
  };
  return { shown, spinning, spin, doneKey, setShown };
}

function anonEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: 'n' + i, name: `Person ${i + 1}`, avatar: String(i + 1), color: TEAM_STYLE[i % 6].c }));
}

export default function Zufall() {
  const { players } = useStore();
  const [tab, setTab] = useState<Tab>('person');
  const [confetti, setConfetti] = useState(0);
  const [anonN, setAnonN] = useState(6);

  const entries: Entry[] = players.length ? players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color })) : anonEntries(anonN);

  // Person
  const personSlot = useSlot<Entry>();
  const [noRepeat, setNoRepeat] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);

  // Teams
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<Entry[][] | null>(null);
  const [teamKey, setTeamKey] = useState(0);

  // Reihenfolge
  const [order, setOrder] = useState<Entry[] | null>(null);
  const [orderKey, setOrderKey] = useState(0);

  // Zahl
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const numSlot = useSlot<number>();

  const NeedN = (
    <Panel>
      <div className="muted small">Keine Spielerliste – wie viele Leute seid ihr?</div>
      <div className="row">
        <Button small color="ghost" onClick={() => setAnonN(Math.max(2, anonN - 1))}>
          −
        </Button>
        <div className="grow center pixel" style={{ fontSize: 18, color: 'var(--yellow)' }}>
          {anonN}
        </div>
        <Button small color="ghost" onClick={() => setAnonN(Math.min(40, anonN + 1))}>
          +
        </Button>
      </div>
    </Panel>
  );

  const pickPerson = () => {
    if (personSlot.spinning || !entries.length) return;
    let pool = noRepeat ? entries.filter((e) => !picked.includes(e.id)) : entries;
    let nextPicked = picked;
    if (!pool.length) {
      pool = entries;
      nextPicked = [];
    }
    const final = pick(pool);
    buzz([15, 30, 15, 30, 15]);
    personSlot.spin(
      () => pick(entries),
      final,
      () => {
        sfx.fanfare();
        buzz([60, 40, 160]);
        setConfetti((c) => c + 1);
        setPicked([...nextPicked, final.id]);
      },
    );
  };

  const makeTeams = () => {
    const sh = shuffle(entries);
    const res: Entry[][] = Array.from({ length: teamCount }, () => []);
    sh.forEach((e, i) => res[i % teamCount].push(e));
    sfx.drumroll(0.6);
    buzz([20, 30, 20, 30, 60]);
    setTeams(res);
    setTeamKey((k) => k + 1);
    window.setTimeout(() => sfx.success(), 600);
  };

  const makeOrder = () => {
    sfx.whoosh();
    buzz(40);
    setOrder(shuffle(entries));
    setOrderKey((k) => k + 1);
    entries.forEach((_, i) => window.setTimeout(() => sfx.tick(), 120 + i * 90));
  };

  const rollNumber = () => {
    if (numSlot.spinning) return;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const final = between(lo, hi);
    numSlot.spin(
      () => between(lo, hi),
      final,
      () => {
        sfx.coin();
        buzz([40, 30, 80]);
      },
    );
  };

  const p = personSlot.shown;

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      <Seg<Tab>
        value={tab}
        onChange={setTab}
        color="var(--orange)"
        options={[
          { value: 'person', label: '👉 Person' },
          { value: 'teams', label: '👥 Teams' },
          { value: 'reihe', label: '🔢 Reihe' },
          { value: 'zahl', label: '🎰 Zahl' },
        ]}
      />

      {tab === 'person' && (
        <>
          {!players.length && NeedN}
          <div key={personSlot.doneKey} className={'gt-slot' + (personSlot.spinning ? ' spin' : personSlot.doneKey ? ' done' : '')}>
            {p ? (
              players.length ? (
                <>
                  <div className="s-av">{p.avatar}</div>
                  <div className="s-name" style={{ color: personSlot.spinning ? undefined : p.color }}>
                    {p.name}
                  </div>
                </>
              ) : (
                <div className="s-num">{p.avatar}</div>
              )
            ) : (
              <div className="s-name">???</div>
            )}
          </div>
          {!personSlot.spinning && p && personSlot.doneKey > 0 && (
            <p className="center pixel gt-pop-in" style={{ fontSize: 11, color: 'var(--green)' }}>
              ★ {players.length ? p.name : 'Nummer ' + p.avatar} ist dran! ★
            </p>
          )}
          <Button color="orange" big block onClick={pickPerson} disabled={personSlot.spinning}>
            🎯 Wer ist dran?
          </Button>
          <Toggle
            label="Keine Wiederholung"
            hint={noRepeat ? `Schon gezogen: ${picked.length}/${entries.length}` : 'Jede Person kann jedes Mal kommen'}
            value={noRepeat}
            onChange={(v) => {
              setNoRepeat(v);
              setPicked([]);
            }}
          />
        </>
      )}

      {tab === 'teams' && (
        <>
          {!players.length && NeedN}
          <div className="muted small">Anzahl Teams</div>
          <Seg<number>
            value={teamCount}
            onChange={(n) => {
              setTeamCount(n);
              setTeams(null);
            }}
            options={[2, 3, 4, 5, 6].filter((n) => n <= Math.max(2, entries.length)).map((n) => ({ value: n, label: String(n) }))}
          />
          <Button color="cyan" big block onClick={makeTeams}>
            {teams ? '🔀 Neu mischen' : '👥 Teams auslosen'}
          </Button>
          {teams && (
            <div className={teamCount > 2 ? 'grid2' : 'col'} key={teamKey}>
              {teams.map((t, i) => (
                <div key={i} className="gt-team-card gt-pop-in" style={{ '--tc': TEAM_STYLE[i].c, animationDelay: i * 0.15 + 's' } as CSSProperties}>
                  <h3>
                    {TEAM_STYLE[i].e} {TEAM_STYLE[i].name}
                  </h3>
                  {t.map((e) => (
                    <div key={e.id} style={{ fontSize: 22 }}>
                      {players.length ? e.avatar : '•'} {e.name}
                    </div>
                  ))}
                  <div className="muted small">{t.length} Leute</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'reihe' && (
        <>
          {!players.length && NeedN}
          <Button color="purple" big block onClick={makeOrder}>
            {order ? '🔀 Neu mischen' : '🔢 Reihenfolge auslosen'}
          </Button>
          {order && (
            <div className="list" key={orderKey}>
              {order.map((e, i) => (
                <div key={e.id} className="score-row gt-pop-in" style={{ animationDelay: i * 0.09 + 's', boxShadow: `0 0 0 3px var(--shadow), inset 6px 0 0 ${e.color}` }}>
                  <span className="rank">{i + 1}.</span>
                  {players.length > 0 && <span style={{ fontSize: 24 }}>{e.avatar}</span>}
                  <span className="grow">{e.name}</span>
                  {i === 0 && <span className="pixel" style={{ fontSize: 8, color: 'var(--green)' }}>FÄNGT AN</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'zahl' && (
        <>
          <div className="grid2">
            <label>
              <div className="muted small">Von</div>
              <input className="input" type="number" inputMode="numeric" value={min} onChange={(e) => setMin(Number(e.target.value) || 0)} />
            </label>
            <label>
              <div className="muted small">Bis</div>
              <input className="input" type="number" inputMode="numeric" value={max} onChange={(e) => setMax(Number(e.target.value) || 0)} />
            </label>
          </div>
          <div className="row wrap center">
            {[
              [1, 6],
              [1, 10],
              [1, 20],
              [1, 100],
            ].map(([a, b]) => (
              <Button
                key={b}
                small
                color={min === a && max === b ? 'yellow' : 'ghost'}
                onClick={() => {
                  setMin(a);
                  setMax(b);
                }}
              >
                {a}–{b}
              </Button>
            ))}
          </div>
          <div key={numSlot.doneKey} className={'gt-slot' + (numSlot.spinning ? ' spin' : numSlot.doneKey ? ' done' : '')}>
            <div className="s-num">{numSlot.shown ?? '?'}</div>
          </div>
          <Button color="yellow" big block onClick={rollNumber} disabled={numSlot.spinning}>
            🎰 Zahl ziehen
          </Button>
        </>
      )}
    </div>
  );
}
