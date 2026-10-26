import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, PlayerChip, Seg } from '../components/ui';
import { KATEGORIEN } from '../data/kategorien';
import { between, getDeck } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { useStore } from '../lib/store';
import { useSipsFor } from './gameKit';
import './arcadeGames.css';

type Mode = 'kategorie' | 'silbe';
type Phase = 'setup' | 'running' | 'boom';

const SILBEN = ['ER', 'AN', 'SCH', 'BAU', 'EIN', 'UNG', 'KEIT', 'HAUS', 'BER', 'TER', 'STR', 'ACH', 'AU', 'EI', 'OL', 'SP', 'ST', 'LICH', 'HEIT', 'EN', 'KA', 'MA', 'TO', 'RA', 'BR', 'GL', 'PF', 'ZU', 'UM', 'IN', 'OR', 'EL', 'AL', 'UND', 'ING', 'ORT', 'ACK', 'ECK', 'ITZ', 'SCHN', 'KR', 'FL', 'TT', 'LL', 'BIER', 'WEIN', 'LAND', 'BERG', 'SEE', 'ROT'];

const PENALTY = 3;

export default function Wortbombe() {
  const { custom, players, addStat } = useStore();
  const sipsFor = useSipsFor();
  const [mode, setMode] = useState<Mode>('kategorie');
  const [phase, setPhase] = useState<Phase>('setup');
  const [prompt, setPrompt] = useState('');
  const [passes, setPasses] = useState(0);
  const [bd, setBd] = useState(1.2);
  const [loser, setLoser] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boomAt = useRef(0);

  const cats = useMemo(() => [...KATEGORIEN, ...(custom.kategorien ?? []).map((p) => p.t)].filter(Boolean), [custom.kategorien]);

  const newPrompt = useCallback(
    (m: Mode = mode) => {
      if (m === 'silbe') setPrompt(getDeck('wortbombe-silbe', SILBEN).draw() ?? 'ER');
      else setPrompt(getDeck('wortbombe-kat', cats).draw() ?? 'Biersorten');
    },
    [mode, cats],
  );

  const stopLoop = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => stopLoop, []);

  const explode = useCallback(() => {
    stopLoop();
    boomAt.current = Date.now();
    sfx.boom();
    setTimeout(() => sfx.buzzer(), 250);
    buzz([800, 120, 400]);
    setLoser(null);
    setPhase('boom');
  }, []);

  const startRound = (keepPrompt = false) => {
    stopLoop();
    if (!keepPrompt) newPrompt();
    setPasses(0);
    setRound((r) => r + 1);
    setPhase('running');
    sfx.powerup();
    buzz(60);
    const dur = between(15, 45) * 1000;
    const t0 = Date.now();
    let alt = false;
    const loop = () => {
      const frac = (Date.now() - t0) / dur;
      if (frac >= 1) {
        explode();
        return;
      }
      const interval = Math.max(85, 650 - 560 * Math.pow(frac, 1.25));
      alt = !alt;
      if (alt) sfx.tick();
      else sfx.tock();
      if (frac > 0.8) buzz(15);
      setBd(Math.max(0.18, (interval * 2) / 1000));
      timeoutRef.current = setTimeout(loop, interval);
    };
    loop();
  };

  const pass = () => {
    if (phase !== 'running') return;
    setPasses((p) => p + 1);
    sfx.whoosh();
    buzz(20);
  };

  if (phase === 'setup') {
    return (
      <div className="screen">
        <div className="center">
          <div className="ga-bomb" style={{ '--bd': '1.4s' } as CSSProperties}>
            💣
          </div>
          <div className="ga-title">WORTBOMBE</div>
        </div>
        <h2>Modus</h2>
        <Seg
          options={[
            { value: 'kategorie', label: '📚 Kategorie' },
            { value: 'silbe', label: '🔤 Silbe' },
          ]}
          value={mode}
          onChange={setMode}
          color="var(--red)"
        />
        <div className="panel small">
          {mode === 'kategorie' ? (
            <>Die App zeigt eine Kategorie (z. B. „Biersorten“). Nenne einen passenden Begriff und gib das Handy weiter.</>
          ) : (
            <>Die App zeigt eine Silbe (z. B. „ER“). Nenne ein Wort, das sie enthält – „Erdäpfel“, „Bergwerk“ … – und gib weiter.</>
          )}
          <br />
          ⏱ Der Timer ist geheim (15–45 s). Wer die Bombe hält, wenn’s knallt: <b>{sipsFor(PENALTY)}</b>!
          <br />
          🔁 Wiederholungen & Zögern gelten nicht.
        </div>
        {mode === 'kategorie' && <p className="muted small center">{cats.length} Kategorien im Topf – eigene unter „Eigene Inhalte“.</p>}
        <Button color="red" big block onClick={() => startRound()}>
          💣 Zünden!
        </Button>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div className="screen">
        <div className="ga-tapscreen" onClick={pass}>
          <div className="ga-kicker">{mode === 'silbe' ? 'Wort mit der Silbe' : 'Kategorie'}</div>
          <div className="ga-title ga-pop" key={round} style={{ fontSize: prompt.length > 18 ? 18 : prompt.length > 10 ? 22 : 30, padding: '0 6px' }}>
            {mode === 'silbe' ? `„${prompt}“` : prompt}
          </div>
          <div className="ga-bomb" style={{ '--bd': bd + 's' } as CSSProperties}>
            💣
          </div>
          <div className="pixel" style={{ fontSize: 10, color: 'var(--muted)' }}>
            {passes}× weitergegeben
          </div>
          <div className="muted small">Begriff sagen · dann tippen & weitergeben</div>
        </div>
        <Button color="yellow" big block onClick={pass} silent>
          Weiter ➜
        </Button>
      </div>
    );
  }

  // BOOM
  const guard = () => Date.now() - boomAt.current > 800;
  const lp = players.find((p) => p.id === loser) ?? null;
  return (
    <>
      <div className="ga-explode" key={'ex' + round} />
      <div className="screen centered center ga-shake-hard" key={'boom' + round}>
        <div style={{ fontSize: 120, lineHeight: 1 }} className="ga-pop">
          💥
        </div>
        <div className="ga-title xl" style={{ color: 'var(--red)', textShadow: '4px 4px 0 var(--yellow), 8px 8px 0 var(--shadow)' }}>
          BOOM!
        </div>
        <p style={{ fontSize: 28 }}>
          Wer das Handy hält: <b style={{ color: 'var(--yellow)' }}>{sipsFor(PENALTY, lp)}</b>!
        </p>
        <p className="muted small">
          {mode === 'silbe' ? 'Silbe' : 'Kategorie'}: {prompt} · {passes}× weitergegeben
        </p>
        {players.length > 0 && (
          <div className="panel" style={{ width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Wer hatte die Bombe?</h3>
            <div className="row wrap center">
              {players.map((p) => (
                <PlayerChip
                  key={p.id}
                  player={p}
                  selected={loser === p.id}
                  onClick={() => {
                    if (loser || !guard()) return;
                    setLoser(p.id);
                    addStat(p.id, 'sips', PENALTY);
                    sfx.coin();
                  }}
                />
              ))}
            </div>
            {lp && <p className="ok-notice small">✔ {lp.name}: {sipsFor(PENALTY, lp)} notiert. Prost!</p>}
          </div>
        )}
        <div className="grid2" style={{ width: '100%' }}>
          <Button color="red" onClick={() => guard() && startRound()}>
            💣 Neue Runde
          </Button>
          <Button color="ghost" onClick={() => guard() && startRound(true)}>
            🔁 Gleiche {mode === 'silbe' ? 'Silbe' : 'Kat.'}
          </Button>
        </div>
        <Button small color="ghost" onClick={() => setPhase('setup')}>
          Modus ändern
        </Button>
      </div>
    </>
  );
}
