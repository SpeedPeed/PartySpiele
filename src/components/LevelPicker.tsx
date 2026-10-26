import type { CSSProperties } from 'react';
import type { Level } from '../data/types';
import { LEVELS } from '../lib/format';
import { useStore } from '../lib/store';
import { sfx } from '../lib/sound';

const ALL: Level[] = [1, 2, 3, 4];

export function LevelPicker() {
  const { settings, setSettings } = useStore();
  const toggle = (l: Level) => {
    sfx.click();
    const has = settings.levels.includes(l);
    const next = has ? settings.levels.filter((x) => x !== l) : [...settings.levels, l].sort();
    if (next.length) setSettings({ levels: next });
  };
  return (
    <div className="col" style={{ gap: 8 }}>
      {ALL.map((l) => {
        const lv = LEVELS[l];
        const on = settings.levels.includes(l);
        return (
          <button
            key={l}
            className="list-item"
            style={{ border: 'none', cursor: 'pointer', color: 'var(--ink)', textAlign: 'left', opacity: on ? 1 : 0.5, boxShadow: on ? `0 0 0 3px var(--shadow), inset 6px 0 0 ${lv.color}` : '0 0 0 3px var(--shadow)' } as CSSProperties}
            onClick={() => toggle(l)}
          >
            <span style={{ fontSize: 28 }}>{lv.emoji}</span>
            <div className="grow">
              <div style={{ color: lv.color }}>{lv.name}</div>
              <div className="muted small">{lv.desc}</div>
            </div>
            <span className="pixel" style={{ fontSize: 14 }}>
              {on ? '☑' : '☐'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
