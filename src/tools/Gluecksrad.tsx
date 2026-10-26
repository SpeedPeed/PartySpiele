import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Confetti, Panel, Rich, Seg } from '../components/ui';
import { plain } from '../lib/format';
import { useFill } from '../lib/hooks';
import { useStore, type Player } from '../lib/store';
import { sample } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './tools.css';

type Template = 'strafen' | 'spieler' | 'eigene';

interface Field {
  label: string;
  text: string;
  emoji: string;
  player?: Player;
  again?: boolean;
}

const STRAFEN: Field[] = [
  { label: '{s:1}', text: 'Du trinkst {s:1}. Gemütlich!', emoji: '🍺' },
  { label: '{s:2}', text: 'Du trinkst {s:2}. Prost!', emoji: '🍺' },
  { label: '{s:3}', text: 'Autsch – {s:3} für dich!', emoji: '🍻' },
  { label: 'EX!', text: 'EX! {ex}. Na servas!', emoji: '💀' },
  { label: 'Verteil {s:3}', text: 'Verteil {s:3} – an wen du willst, du Glückspilz.', emoji: '🎁' },
  { label: 'Wasserpause', text: 'Wasserpause! 💧 Ein Glas Wasser für dich – deine Leber sagt Danke.', emoji: '💧' },
  { label: 'Joker', text: 'JOKER! 🃏 Du darfst eine zukünftige Strafe einmal abwehren.', emoji: '🃏' },
  { label: 'Alle trinken', text: 'Alle trinken {s:1}! Prost, Leute!', emoji: '🍻' },
  { label: 'Links trinkt', text: 'Links von dir trinkt {s:2}.', emoji: '👈' },
  { label: 'Rechts trinkt', text: 'Rechts von dir trinkt {s:2}.', emoji: '👉' },
  { label: 'Nochmal!', text: 'Nochmal drehen – das Rad will mehr!', emoji: '🔁', again: true },
  { label: 'Neue Regel', text: 'Erfinde eine neue Regel – sie gilt, bis jemand anderes hier landet.', emoji: '📜' },
];

const COLORS = ['#ff2e88', '#19e3ff', '#ffe03a', '#3dff6e', '#ff8a1f', '#a64dff', '#ff5f5f', '#5fa8ff'];
const DARK_TEXT = new Set(['#19e3ff', '#ffe03a', '#3dff6e', '#5fa8ff', '#ff8a1f']);
const norm = (a: number) => ((a % 360) + 360) % 360;

/** Repeat a short list so the wheel has 8–12 fields (if possible). */
function pad<T>(list: T[]): T[] {
  const n = list.length;
  if (!n) return [];
  for (let k = 1; k <= 8; k++) if (n * k >= 8 && n * k <= 12) return Array.from({ length: n * k }, (_, i) => list[i % n]);
  return list;
}

function wedge(i: number, n: number, r: number) {
  const a0 = ((i * 360) / n) * (Math.PI / 180);
  const a1 = (((i + 1) * 360) / n) * (Math.PI / 180);
  const x0 = r * Math.sin(a0);
  const y0 = -r * Math.cos(a0);
  const x1 = r * Math.sin(a1);
  const y1 = -r * Math.cos(a1);
  const large = 360 / n > 180 ? 1 : 0;
  return `M0 0 L${x0.toFixed(3)} ${y0.toFixed(3)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
}

export default function Gluecksrad() {
  const { players, custom, settings, addCustom, removeCustom } = useStore();
  const fill = useFill();
  const nav = useNavigate();
  const [tpl, setTpl] = useState<Template>('strafen');
  const [shuffleKey, setShuffleKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ field: Field; text: string } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [newField, setNewField] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const own = custom.gluecksrad ?? [];

  const fields: Field[] = useMemo(() => {
    void shuffleKey;
    if (tpl === 'strafen') return STRAFEN.map((f) => ({ ...f, label: plain(fill(f.label).text) }));
    if (tpl === 'spieler') {
      const ps = players.length > 12 ? sample(players, 12) : players;
      return pad(ps.map((p) => ({ label: p.name, text: '{p} ist dran! 🎯', emoji: p.avatar, player: p })));
    }
    const list = own.length > 12 ? sample(own, 12) : own;
    return pad(list.map((p) => ({ label: plain(fill(p.t).text), text: p.t, emoji: '🎡' })));
  }, [tpl, players, own, fill, shuffleKey]);

  const n = fields.length;
  const seg = n ? 360 / n : 360;

  const wheel = useRef<SVGGElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const rot = useRef(0);
  const omega = useRef(0);
  const raf = useRef(0);
  const lastT = useRef(0);
  const lastIdx = useRef(-1);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const pointed = (r: number) => (n ? Math.floor(norm(-r) / seg) % n : 0);

  const apply = () => {
    if (wheel.current) wheel.current.style.transform = `rotate(${rot.current}deg)`;
    const idx = pointed(rot.current);
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      sfx.tick();
      if (omega.current < 300) buzz(6);
      const p = pointer.current;
      if (p) {
        p.classList.remove('flick');
        void p.offsetWidth;
        p.classList.add('flick');
      }
    }
  };

  const done = () => {
    setSpinning(false);
    const f = fields[pointed(rot.current)];
    if (!f) return;
    const text = f.player ? fill(f.text, null, { p: f.player }).text : fill(f.text).text;
    setResult({ field: f, text });
    sfx.fanfare();
    buzz([60, 40, 60, 40, 200]);
    setConfetti((c) => c + 1);
  };

  const step = (t: number) => {
    const dt = Math.min(0.05, (t - lastT.current) / 1000);
    lastT.current = t;
    const dec = (0.42 * omega.current + 55) * dt;
    if (omega.current <= dec) {
      omega.current = 0;
      apply();
      done();
      return;
    }
    omega.current -= dec;
    rot.current += omega.current * dt;
    apply();
    raf.current = requestAnimationFrame(step);
  };

  const spin = () => {
    if (spinning || n < 2) return;
    setResult(null);
    setSpinning(true);
    omega.current = 750 + Math.random() * 750;
    lastT.current = performance.now();
    sfx.whoosh();
    buzz(30);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
  };

  const bulbs = Array.from({ length: 20 }, (_, i) => {
    const a = (i * 18 * Math.PI) / 180;
    return { x: 104 * Math.sin(a), y: -104 * Math.cos(a), alt: i % 2 === 1 };
  });

  const longest = Math.max(...fields.map((f) => f.label.length), 1);
  const fs = longest > 12 ? 6 : longest > 9 ? 7 : 8;
  const cut = (s: string) => (s.length > 15 ? s.slice(0, 14) + '…' : s);

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      <Seg<Template>
        value={tpl}
        onChange={(t) => {
          if (spinning) return;
          setTpl(t);
          setResult(null);
        }}
        color="var(--pink)"
        options={[
          { value: 'strafen', label: '🍺 Strafen' },
          { value: 'spieler', label: '👥 Spieler' },
          { value: 'eigene', label: '✏️ Eigene' },
        ]}
      />

      {n < 2 ? (
        <Panel className="center">
          {tpl === 'spieler' ? (
            <>
              <p>Für das Spieler-Rad braucht ihr mindestens 2 Leute in der Spielerliste.</p>
              <Button color="yellow" onClick={() => nav('/spieler')}>
                Spieler eintragen
              </Button>
            </>
          ) : (
            <p>Noch zu wenig eigene Felder ({own.length}/2). Leg unten welche an!</p>
          )}
        </Panel>
      ) : (
        <div className={'gt-wheel-wrap' + (spinning ? ' spinning' : '')} onClick={spin} role="button" aria-label="Rad drehen">
          <div ref={pointer} className="gt-pointer" />
          <svg viewBox="-112 -112 224 224">
            <circle r="111" fill="#05020f" />
            <circle r="108" fill="#5a2e00" />
            <g ref={wheel} className="gt-wheel" style={{ transform: `rotate(${rot.current}deg)` }}>
              {fields.map((f, i) => {
                const c = COLORS[i > 0 && i === n - 1 && i % COLORS.length === 0 ? 3 : i % COLORS.length];
                const mid = i * seg + seg / 2;
                return (
                  <g key={i}>
                    <path d={wedge(i, n, 100)} fill={c} stroke="#05020f" strokeWidth="1.5" />
                    <g transform={`rotate(${mid})`}>
                      <text
                        x="0"
                        y="-58"
                        transform="rotate(-90 0 -58)"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily="'Press Start 2P', monospace"
                        fontSize={fs}
                        fill={DARK_TEXT.has(c) ? '#0a0420' : '#fff'}
                      >
                        {cut(f.label)}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
            {bulbs.map((b, i) => (
              <circle key={i} cx={b.x} cy={b.y} r="3.2" fill="#ffe03a" className={'gt-bulb' + (b.alt ? ' alt' : '')} />
            ))}
            <circle r="16" fill="#1d0f4a" stroke="#05020f" strokeWidth="3" />
            <text textAnchor="middle" dominantBaseline="central" fontSize="14" fill="#ffe03a" fontFamily="'Press Start 2P', monospace">
              ★
            </text>
          </svg>
        </div>
      )}

      <Button color="pink" big block onClick={spin} disabled={spinning || n < 2}>
        {spinning ? 'Dreht sich …' : '🎡 Drehen!'}
      </Button>

      {tpl !== 'strafen' && (tpl === 'spieler' ? players.length > 12 : own.length > 12) && (
        <Button small color="ghost" onClick={() => setShuffleKey((k) => k + 1)}>
          🔀 Andere Felder (max. 12 am Rad)
        </Button>
      )}

      {tpl === 'eigene' && (
        <Panel>
          <div className="row between" onClick={() => setEditOpen(!editOpen)} style={{ cursor: 'pointer' }}>
            <h3 style={{ margin: 0 }}>✏️ Eigene Felder ({own.length})</h3>
            <span>{editOpen || own.length < 2 ? '▲' : '▼'}</span>
          </div>
          {(editOpen || own.length < 2) && (
            <>
              <p className="muted small">Platzhalter erlaubt: {'{s:2}'} = {fill('{s:2}').text}, {'{ex}'}, {'{p}'} = Zufallsname.</p>
              <div className="row">
                <input
                  className="input"
                  value={newField}
                  placeholder="z. B. Tanz 10 s oder {s:2}"
                  onChange={(e) => setNewField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newField.trim()) {
                      addCustom('gluecksrad', { t: newField.trim(), l: 1 });
                      setNewField('');
                      sfx.coin();
                    }
                  }}
                />
                <Button
                  small
                  color="green"
                  disabled={!newField.trim()}
                  onClick={() => {
                    addCustom('gluecksrad', { t: newField.trim(), l: 1 });
                    setNewField('');
                    sfx.coin();
                  }}
                >
                  +
                </Button>
              </div>
              <div className="list" style={{ marginTop: 8 }}>
                {own.map((p, i) => (
                  <div className="list-item" key={i}>
                    <span className="grow">{p.t}</span>
                    <button className="iconbtn" aria-label="Löschen" onClick={() => removeCustom('gluecksrad', i)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}

      {!settings.drinkMode && tpl === 'strafen' && <p className="muted small center">Alkoholfreier Modus: Strafpunkte statt Schlucke.</p>}

      {result && (
        <div className="gt-pop-back" onClick={() => setResult(null)}>
          <div className="gt-pop" onClick={(e) => e.stopPropagation()}>
            <div className="card" style={{ '--cc': result.field.player?.color ?? 'var(--yellow)' } as CSSProperties}>
              <div className="card-kicker">Das Rad hat entschieden</div>
              <div className="card-emoji">{result.field.emoji}</div>
              <div className="card-text">
                <Rich text={result.text} />
              </div>
            </div>
            <div className="grid2">
              <Button color="ghost" onClick={() => setResult(null)}>
                OK
              </Button>
              <Button
                color={result.field.again ? 'pink' : 'green'}
                onClick={() => {
                  setResult(null);
                  window.setTimeout(spin, 50);
                }}
              >
                🔁 Nochmal
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
