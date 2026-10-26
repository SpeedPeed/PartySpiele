import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Level } from '../data/types';
import { LEVELS, NAME_END, NAME_START, sips } from '../lib/format';
import { useStore, type Player } from '../lib/store';
import { buzz, sfx } from '../lib/sound';

type Color = 'pink' | 'cyan' | 'yellow' | 'green' | 'orange' | 'red' | 'purple' | 'ghost';

export function Button({
  children,
  onClick,
  color = 'pink',
  block,
  big,
  small,
  disabled,
  silent,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  color?: Color;
  block?: boolean;
  big?: boolean;
  small?: boolean;
  disabled?: boolean;
  silent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      className={['btn', color, block && 'block', big && 'big', small && 'small'].filter(Boolean).join(' ')}
      disabled={disabled}
      style={style}
      onClick={() => {
        if (!silent) sfx.click();
        buzz(15);
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Panel({ children, glow, style, className }: { children: ReactNode; glow?: 'pink' | 'cyan' | 'yellow'; style?: CSSProperties; className?: string }) {
  return (
    <div className={['panel', glow && `glow-${glow}`, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

export function TopBar({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <button
        className="iconbtn"
        aria-label="Zurück"
        onClick={() => {
          sfx.click();
          if (onBack) onBack();
          else nav(-1);
        }}
      >
        ◀
      </button>
      <div className="title">{title}</div>
      {right ?? <div style={{ width: 44 }} />}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          {title ? <h2>{title}</h2> : <span />}
          <button className="iconbtn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div
      className="toggle"
      onClick={() => {
        sfx.click();
        onChange(!value);
      }}
    >
      <div>
        <div>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <div className={'switch' + (value ? ' on' : '')} />
    </div>
  );
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  color,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  color?: string;
}) {
  return (
    <div className="seg" style={color ? ({ '--sc': color } as CSSProperties) : undefined}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={o.value === value ? 'on' : ''}
          onClick={() => {
            sfx.click();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Renders a filled text and highlights player names. */
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    const s = rest.indexOf(NAME_START);
    if (s < 0) {
      parts.push(rest);
      break;
    }
    const e = rest.indexOf(NAME_END, s);
    if (s > 0) parts.push(rest.slice(0, s));
    parts.push(
      <span className="name" key={k++}>
        {rest.slice(s + 1, e < 0 ? undefined : e)}
      </span>,
    );
    rest = e < 0 ? '' : rest.slice(e + 1);
  }
  return <>{parts}</>;
}

export function LevelBadge({ l }: { l: Level }) {
  const lv = LEVELS[l];
  return (
    <span className="badge" style={{ '--bc': lv.color, color: '#0a0420' } as CSSProperties}>
      {lv.emoji} {lv.name}
    </span>
  );
}

export function PromptCard({
  kicker,
  text,
  level,
  emoji,
  color,
  children,
  cardKey,
}: {
  kicker?: ReactNode;
  text: string;
  level?: Level;
  emoji?: string;
  color?: string;
  children?: ReactNode;
  cardKey?: string | number;
}) {
  const long = text.length > 110;
  return (
    <div className="card" key={cardKey} style={{ '--cc': color ?? (level ? LEVELS[level].color : 'var(--pink)') } as CSSProperties}>
      {kicker && <div className="card-kicker">{kicker}</div>}
      {emoji && <div className="card-emoji">{emoji}</div>}
      <div className={'card-text' + (long ? ' long' : '')}>
        <Rich text={text} />
      </div>
      {level && <LevelBadge l={level} />}
      {children}
    </div>
  );
}

export function PlayerChip({ player, selected, onClick, extra }: { player: Player; selected?: boolean; onClick?: () => void; extra?: ReactNode }) {
  const content = (
    <>
      <span className="av">{player.avatar}</span>
      <span>{player.name}</span>
      {player.noAlcohol && <span title="alkoholfrei">🚫🍺</span>}
      {extra}
    </>
  );
  const style = { '--pc': player.color } as CSSProperties;
  if (onClick)
    return (
      <button
        className={'chip' + (selected ? ' sel' : '')}
        style={style}
        onClick={() => {
          sfx.click();
          onClick();
        }}
      >
        {content}
      </button>
    );
  return (
    <span className={'chip' + (selected ? ' sel' : '')} style={style}>
      {content}
    </span>
  );
}

export function PlayerPicker({ selected, onToggle, players }: { selected: string[]; onToggle: (id: string) => void; players?: Player[] }) {
  const store = useStore();
  const list = players ?? store.players;
  return (
    <div className="row wrap">
      {list.map((p) => (
        <PlayerChip key={p.id} player={p} selected={selected.includes(p.id)} onClick={() => onToggle(p.id)} />
      ))}
    </div>
  );
}

export function TimerBar({ left, total }: { left: number; total: number }) {
  const pct = total > 0 ? (left / total) * 100 : 0;
  const cls = pct < 15 ? 'crit' : pct < 35 ? 'warn' : '';
  return (
    <div className={'timer-bar ' + cls}>
      <div style={{ width: pct + '%' }} />
    </div>
  );
}

/** Gate: renders children only when enough players are set up. */
export function NeedPlayers({ min, children }: { min: number; children: ReactNode }) {
  const { players } = useStore();
  const nav = useNavigate();
  if (players.length >= min) return <>{children}</>;
  return (
    <div className="screen centered center">
      <div className="avatar-big">👾</div>
      <h2>Zu wenig Spieler!</h2>
      <p>
        Für dieses Spiel braucht ihr mindestens <b>{min}</b> Spieler. Aktuell: {players.length}.
      </p>
      <Button color="yellow" big onClick={() => nav('/spieler')}>
        Spieler eintragen
      </Button>
    </div>
  );
}

/** Floating button + sheet to log sips / penalty points per player. */
export function SipLogger() {
  const { players, addStat, stats, settings } = useStore();
  const [open, setOpen] = useState(false);
  if (!players.length) return null;
  return (
    <>
      <button
        className="fab"
        aria-label="Schlucke zählen"
        onClick={() => {
          sfx.click();
          setOpen(true);
        }}
      >
        {settings.drinkMode ? '🍺' : '⭐'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={settings.drinkMode ? 'Schluck-Zähler' : 'Strafpunkte'}>
        <p className="muted small">Tippe, wer gerade was kassiert hat – fließt in die Abend-Statistik.</p>
        <div className="list">
          {players.map((p) => (
            <div className="list-item" key={p.id}>
              <span style={{ fontSize: 26 }}>{p.avatar}</span>
              <div className="grow">
                <div>{p.name}</div>
                <div className="muted small">{sips(stats[p.id]?.sips ?? 0, settings.drinkMode && !p.noAlcohol)}</div>
              </div>
              {[1, 2, 5].map((n) => (
                <button
                  key={n}
                  className="btn small yellow"
                  style={{ margin: '2px 4px 6px', minWidth: 44 }}
                  onClick={() => {
                    sfx.coin();
                    buzz(20);
                    addStat(p.id, 'sips', n);
                  }}
                >
                  +{n}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

/** Pixel confetti burst; re-fires whenever `fire` changes to a truthy new value. */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire) return;
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const colors = ['#ff2e88', '#19e3ff', '#ffe03a', '#3dff6e', '#ff8a1f', '#a64dff'];
    const parts = Array.from({ length: 140 }, () => ({
      x: c.width / 2,
      y: c.height / 2,
      vx: (Math.random() - 0.5) * 18,
      vy: -Math.random() * 18 - 4,
      s: 6 + Math.floor(Math.random() * 3) * 3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    let frames = 0;
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.vy += 0.5;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, p.s, p.s);
      }
      if (++frames < 130) raf = requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, c.width, c.height);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} className="confetti-canvas" />;
}

export interface PlayingCardData {
  rank: number; // 2..14 (11 Bube, 12 Dame, 13 König, 14 Ass)
  suit: '♥' | '♦' | '♣' | '♠';
}

export const RANK_LABEL: Record<number, string> = { 11: 'B', 12: 'D', 13: 'K', 14: 'A' };
export const RANK_NAME: Record<number, string> = { 11: 'Bube', 12: 'Dame', 13: 'König', 14: 'Ass' };

export function newDeck(): PlayingCardData[] {
  const suits: PlayingCardData['suit'][] = ['♥', '♦', '♣', '♠'];
  const d: PlayingCardData[] = [];
  for (const suit of suits) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit });
  return d;
}

export const isRed = (c: PlayingCardData) => c.suit === '♥' || c.suit === '♦';
export const rankLabel = (r: number) => RANK_LABEL[r] ?? String(r);

export function PlayingCard({ card, small, hidden }: { card?: PlayingCardData | null; small?: boolean; hidden?: boolean }) {
  if (!card || hidden) return <div className={'playing-card back' + (small ? ' sm' : '')} />;
  const lbl = rankLabel(card.rank);
  return (
    <div className={'playing-card' + (isRed(card) ? ' red' : '') + (small ? ' sm' : '')} key={lbl + card.suit}>
      <div>
        {lbl}
        {card.suit}
      </div>
      <div className="mid">{card.suit}</div>
      <div className="bot">
        {lbl}
        {card.suit}
      </div>
    </div>
  );
}

/** "Hand the phone to X" interstitial for secret info. */
export function PassPhone({ to, onReady, hint }: { to: string; onReady: () => void; hint?: string }) {
  return (
    <div className="screen centered center">
      <div className="avatar-big">📱</div>
      <h2>Handy weitergeben an</h2>
      <div className="big-num" style={{ fontSize: 28 }}>
        {to}
      </div>
      <p className="muted">{hint ?? 'Nur diese Person darf jetzt hinschauen!'}</p>
      <Button color="green" big onClick={onReady}>
        Bin bereit
      </Button>
    </div>
  );
}
