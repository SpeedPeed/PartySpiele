/**
 * Gemeinsame Helfer für die Online-Spiele quiz, beichte, schaetzen, antworten, montagsmaler, bluff.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Confetti, Panel, Seg } from '../../components/ui';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, HostButton, MemberChip, Scoreboard, present, useSecondsLeft } from '../kit';
import type { Member } from '../types';

/* ------------------------------------------------------------------ text */

/** Lower-case, Umlaute ausschreiben, alles außer a-z0-9 weg. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Ist `guess` (nach Normalisierung) dasselbe wie `target`? Bei Zielwörtern > 5 Zeichen ist 1 Tippfehler erlaubt. */
export function matches(guess: string, target: string): boolean {
  const g = normalize(guess);
  const t = normalize(target);
  if (!g || !t) return false;
  if (g === t) return true;
  return t.length > 5 && levenshtein(g, t) <= 1;
}

/** Zahl aus Eingabe wie "3.798", "64,75", "20 130", "1.441,5" lesen. */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/[\s'’_]/g, '').replace(/[^0-9.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // der zuletzt vorkommende Trenner ist das Dezimalzeichen
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (dots > 1) s = s.split('.').join('');
  else if (commas > 1) s = s.split(',').join('');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('de-AT', { maximumFractionDigits: 2 });
}

/* ---------------------------------------------------------------- reducer helpers */

/** Haben alle aktuell anwesenden Spieler etwas abgegeben? */
export function allDone(players: Member[], ids: string[]): boolean {
  return players.length > 0 && present(players, ids).length >= players.length;
}

export function addScores(scores: Record<string, number>, gained: Record<string, number>): Record<string, number> {
  const out = { ...scores };
  for (const [id, n] of Object.entries(gained)) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** {p}, {p2}, {p3} durch zufällige, verschiedene Mitspieler-Namen ersetzen. */
export function fillNames(text: string, players: Member[]): string {
  const names = players.map((p) => p.name);
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return text
    .replace(/\{p3\}/g, names[2] ?? 'jemand anderes')
    .replace(/\{p2\}/g, names[1] ?? 'jemand')
    .replace(/\{p\}/g, names[0] ?? 'jemand');
}

/* ---------------------------------------------------------------- hooks */

/** Countdown-Sekunden mit Tick-Sound in den letzten 5 Sekunden. */
export function useTickingSeconds(deadline: number | null | undefined, active = true): number {
  const left = useSecondsLeft(deadline);
  useEffect(() => {
    if (active && deadline && left > 0 && left <= 5) sfx.tick();
  }, [left, active, deadline]);
  return left;
}

/** Ruft `fn` einmal auf, wenn sich `key` ändert (nicht beim ersten Render, außer `initial`). */
export function useOnChange(key: string, fn: () => void, initial = false) {
  const first = useRef(!initial);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fnRef.current();
  }, [key]);
}

/* ---------------------------------------------------------------- UI */

export function OptionRow<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="muted small">{label}</div>
      <Seg options={options} value={value} onChange={onChange} />
    </div>
  );
}

/** Setup-Bildschirm: Host stellt ein, alle anderen warten. */
export function SetupScreen({
  isHost,
  emoji,
  title,
  intro,
  children,
  onStart,
  players,
}: {
  isHost: boolean;
  emoji: string;
  title: string;
  intro: ReactNode;
  children?: ReactNode;
  onStart: () => void;
  players: Member[];
}) {
  return (
    <div className="col">
      <div className="center avatar-big">{emoji}</div>
      <BigTitle>{title}</BigTitle>
      <Panel>
        <div className="small">{intro}</div>
      </Panel>
      <div className="row wrap">
        {players.map((p) => (
          <MemberChip key={p.id} m={p} />
        ))}
      </div>
      {isHost ? (
        <>
          {children}
          <Button color="green" block big onClick={onStart}>
            ▶ Los geht’s!
          </Button>
        </>
      ) : (
        <Panel>
          <p className="center pulse">Der Host stellt das Spiel ein … 🍻</p>
        </Panel>
      )}
    </div>
  );
}

/** Endbildschirm: Sieger, Strafe für den Letzten, Scoreboard, Host-Button "Nochmal". */
export function FinalScreen({
  players,
  scores,
  me,
  isHost,
  fill,
  onAgain,
  unit = '',
  title = 'Endstand',
  children,
}: {
  players: Member[];
  scores: Record<string, number>;
  me: Member;
  isHost: boolean;
  fill: (t: string) => string;
  onAgain: () => void;
  unit?: string;
  title?: string;
  children?: ReactNode;
}) {
  const [boom, setBoom] = useState(0);
  const val = (id: string) => scores[id] ?? 0;
  const max = players.length ? Math.max(...players.map((p) => val(p.id))) : 0;
  const min = players.length ? Math.min(...players.map((p) => val(p.id))) : 0;
  const winners = players.filter((p) => val(p.id) === max);
  const losers = players.length > 1 && min < max ? players.filter((p) => val(p.id) === min) : [];
  const iWon = winners.some((w) => w.id === me.id);
  const iLost = losers.some((l) => l.id === me.id);

  useEffect(() => {
    setBoom(Date.now());
    if (iWon) {
      sfx.fanfare();
      buzz([60, 40, 60, 40, 200]);
    } else sfx.success();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="col">
      <Confetti fire={boom} />
      <BigTitle>🏆 {title} 🏆</BigTitle>
      <Panel glow="yellow" className="center">
        <div className="muted small">{winners.length > 1 ? 'Sieger (Gleichstand!)' : 'Sieger'}</div>
        <div style={{ fontSize: 56, lineHeight: 1.1 }}>{winners.map((w) => w.avatar).join(' ')}</div>
        <div className="pixel" style={{ fontSize: 14, color: 'var(--yellow)', lineHeight: 1.6 }}>
          {winners.map((w) => w.name).join(' & ')}
        </div>
        {iWon && <div style={{ color: 'var(--green)', fontSize: 24 }}>Leiwand, DU hast gewonnen! 🥳</div>}
      </Panel>
      {losers.length > 0 && (
        <div className="notice center">
          🍺 Letzter Platz: <b>{losers.map((l) => l.name).join(' & ')}</b> – {fill('{s:3}')}! {iLost ? 'Oida, das bist du. Prost!' : 'Prost!'}
        </div>
      )}
      {children}
      <Scoreboard players={players} scores={scores} unit={unit} />
      <HostButton isHost={isHost} onClick={onAgain} color="yellow" waitText="Der Host entscheidet, ob’s noch eine Runde gibt …">
        🔁 Nochmal!
      </HostButton>
    </div>
  );
}

/** Kleine Kopfzeile "Runde x/y" + Countdown-Sekunden. */
export function RoundHeader({ round, total, label = 'Runde' }: { round: number; total: number; label?: string }) {
  return (
    <div className="row between">
      <span className="pixel" style={{ fontSize: 10, color: 'var(--cyan)' }}>
        {label} {round}/{total}
      </span>
    </div>
  );
}

/** Horizontaler Pixel-Balken. */
export function Bar({ value, max, color = 'var(--pink)', label }: { value: number; max: number; color?: string; label?: ReactNode }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="col" style={{ gap: 4 }}>
      {label}
      <div style={{ height: 28, background: 'var(--panel2)', boxShadow: '0 0 0 3px var(--shadow)', position: 'relative' } as CSSProperties}>
        <div style={{ width: pct + '%', height: '100%', background: color, transition: 'width .8s steps(12)' }} />
      </div>
    </div>
  );
}

/** Eingabefeld, das nach dem Abschicken leer wird (für Chat/Raten). */
export function ChatInput({ onSubmit, placeholder, disabled, maxLength = 40 }: { onSubmit: (v: string) => void; placeholder: string; disabled?: boolean; maxLength?: number }) {
  const [v, setV] = useState('');
  const go = () => {
    const t = v.trim();
    if (!t) return;
    onSubmit(t);
    setV('');
  };
  return (
    <div className="row">
      <input
        className="input grow"
        value={v}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go();
        }}
        style={{ minWidth: 0 }}
      />
      <Button color="green" disabled={disabled || !v.trim()} onClick={go}>
        ▶
      </Button>
    </div>
  );
}
