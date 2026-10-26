import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Panel } from '../components/ui';
import type { Level } from '../data/types';
import { sfx } from '../lib/sound';
import type { Member } from './types';

/** Seconds left until a deadline timestamp (ms), updating locally. */
export function useSecondsLeft(deadline: number | null | undefined): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [deadline]);
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function Countdown({ deadline, total }: { deadline: number | null | undefined; total: number }) {
  const left = useSecondsLeft(deadline);
  const pct = total ? (left / total) * 100 : 0;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between small">
        <span className="muted">Zeit</span>
        <span className="pixel" style={{ fontSize: 12, color: left <= 5 ? 'var(--red)' : 'var(--yellow)' }}>
          {left}s
        </span>
      </div>
      <div className={'timer-bar ' + (pct < 15 ? 'crit' : pct < 35 ? 'warn' : '')}>
        <div style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export function MemberChip({ m, selected, onClick, extra, dim }: { m: Member; selected?: boolean; onClick?: () => void; extra?: ReactNode; dim?: boolean }) {
  const style = { '--pc': m.color, opacity: dim ? 0.45 : 1 } as CSSProperties;
  const inner = (
    <>
      <span className="av">{m.avatar}</span>
      <span>{m.name}</span>
      {extra}
    </>
  );
  if (!onClick)
    return (
      <span className={'chip' + (selected ? ' sel' : '')} style={style}>
        {inner}
      </span>
    );
  return (
    <button
      className={'chip' + (selected ? ' sel' : '')}
      style={style}
      onClick={() => {
        sfx.click();
        onClick();
      }}
    >
      {inner}
    </button>
  );
}

/** Grid of players to vote for. */
export function VoteGrid({
  players,
  selected,
  onVote,
  exclude = [],
  disabled,
}: {
  players: Member[];
  selected?: string | null;
  onVote: (id: string) => void;
  exclude?: string[];
  disabled?: boolean;
}) {
  return (
    <div className="grid2">
      {players
        .filter((p) => !exclude.includes(p.id))
        .map((p) => (
          <button
            key={p.id}
            disabled={disabled}
            className="tile"
            style={{ '--tc': p.color, minHeight: 90, alignItems: 'center', outline: selected === p.id ? '4px solid var(--yellow)' : undefined } as CSSProperties}
            onClick={() => {
              sfx.select();
              onVote(p.id);
            }}
          >
            <span className="t-emoji">{p.avatar}</span>
            <span className="t-name" style={{ color: 'var(--ink)' }}>
              {p.name}
            </span>
          </button>
        ))}
    </div>
  );
}

/** "X of Y done" + who is missing. */
export function WaitingFor({ players, done, label = 'Warten auf' }: { players: Member[]; done: string[]; label?: string }) {
  const missing = players.filter((p) => !done.includes(p.id));
  return (
    <Panel>
      <div className="row between">
        <span className="pixel" style={{ fontSize: 10 }}>
          {done.length}/{players.length} fertig
        </span>
        <span className="pulse">⏳</span>
      </div>
      {missing.length > 0 && (
        <>
          <div className="muted small" style={{ marginTop: 6 }}>
            {label}:
          </div>
          <div className="row wrap">
            {missing.map((m) => (
              <MemberChip key={m.id} m={m} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function Scoreboard({ players, scores, title = 'Punktestand', unit = '' }: { players: Member[]; scores: Record<string, number>; title?: string; unit?: string }) {
  const sorted = players.slice().sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  return (
    <div className="col" style={{ gap: 8 }}>
      <h3>{title}</h3>
      {sorted.map((p, i) => (
        <div className="score-row" key={p.id}>
          <span className="rank">{i === 0 ? '👑' : `${i + 1}.`}</span>
          <span style={{ fontSize: 24 }}>{p.avatar}</span>
          <span className="grow">{p.name}</span>
          <span className="val">
            {scores[p.id] ?? 0}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Button visible only to the host, others see a waiting hint. */
export function HostButton({ isHost, onClick, children, color = 'green', waitText = 'Der Host geht weiter …' }: { isHost: boolean; onClick: () => void; children: ReactNode; color?: 'green' | 'pink' | 'yellow' | 'cyan'; waitText?: string }) {
  if (!isHost) return <p className="muted center small">{waitText}</p>;
  return (
    <Button color={color} block big onClick={onClick}>
      {children}
    </Button>
  );
}

export function TextAnswer({ onSubmit, placeholder = 'Deine Antwort …', maxLength = 80, numeric }: { onSubmit: (v: string) => void; placeholder?: string; maxLength?: number; numeric?: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="col">
      <input
        className="input"
        value={v}
        inputMode={numeric ? 'decimal' : 'text'}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) onSubmit(v.trim());
        }}
      />
      <Button color="green" block disabled={!v.trim()} onClick={() => onSubmit(v.trim())}>
        Abschicken
      </Button>
    </div>
  );
}

export function filterLevels<T extends { l: Level }>(items: readonly T[], levels: Level[]): T[] {
  const r = items.filter((x) => levels.includes(x.l));
  return r.length ? r : items.slice();
}

/** Removes players that left from a record. */
export function present(players: Member[], ids: string[]): string[] {
  const set = new Set(players.map((p) => p.id));
  return ids.filter((id) => set.has(id));
}

export function BigTitle({ children, color = 'var(--yellow)' }: { children: ReactNode; color?: string }) {
  return (
    <div className="pixel center" style={{ fontSize: 16, color, lineHeight: 1.6, padding: '8px 0' }}>
      {children}
    </div>
  );
}
