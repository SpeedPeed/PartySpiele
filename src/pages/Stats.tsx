import { Confetti, Panel, TopBar } from '../components/ui';
import { sips } from '../lib/format';
import { statsOf, useStore, type Player, type PlayerStats } from '../lib/store';
import { useEffect, useState } from 'react';
import { sfx } from '../lib/sound';

interface Title {
  emoji: string;
  name: string;
  desc: string;
  key: keyof PlayerStats;
}

const TITLES: Title[] = [
  { emoji: '🍺', name: 'Schluckspecht des Abends', desc: 'Die meisten Schlucke/Strafpunkte', key: 'sips' },
  { emoji: '🦁', name: 'Mutigste Sau', desc: 'Die meisten erledigten Aufgaben', key: 'done' },
  { emoji: '🐔', name: 'Angsthase', desc: 'Am öftesten gekniffen', key: 'refused' },
  { emoji: '🏆', name: 'Gaudi-Champion', desc: 'Die meisten Siege', key: 'wins' },
  { emoji: '⭐', name: 'Punktekönig:in', desc: 'Die meisten Punkte', key: 'points' },
];

export default function Stats() {
  const { players, stats, settings } = useStore();
  const [fire, setFire] = useState(0);
  useEffect(() => {
    if (players.length) {
      sfx.fanfare();
      setFire(1);
    }
  }, [players.length]);

  const best = (k: keyof PlayerStats): Player | null => {
    let top: Player | null = null;
    let v = 0;
    for (const p of players) {
      const x = statsOf(stats, p.id)[k];
      if (x > v) {
        v = x;
        top = p;
      }
    }
    return top;
  };

  const ranking = players.slice().sort((a, b) => statsOf(stats, b.id).sips - statsOf(stats, a.id).sips);

  return (
    <div className="app">
      <Confetti fire={fire} />
      <TopBar title="Hall of Fame" />
      <div className="screen">
        <h2>🏅 Titel des Abends</h2>
        <div className="col">
          {TITLES.map((t) => {
            const p = best(t.key);
            return (
              <Panel key={t.key}>
                <div className="row">
                  <span style={{ fontSize: 36 }}>{t.emoji}</span>
                  <div className="grow">
                    <div className="pixel" style={{ fontSize: 10, color: 'var(--yellow)' }}>
                      {t.name}
                    </div>
                    <div className="muted small">{t.desc}</div>
                  </div>
                  <div style={{ fontSize: 24 }}>{p ? `${p.avatar} ${p.name}` : '–'}</div>
                </div>
              </Panel>
            );
          })}
        </div>

        <h2>📊 Rangliste</h2>
        {players.length === 0 && <p className="muted">Noch keine Spieler.</p>}
        {ranking.map((p, i) => {
          const s = statsOf(stats, p.id);
          return (
            <div className="score-row" key={p.id}>
              <span className="rank">{i + 1}.</span>
              <span style={{ fontSize: 26 }}>{p.avatar}</span>
              <div className="grow">
                <div>{p.name}</div>
                <div className="muted small">
                  ✔ {s.done} · ✘ {s.refused} · 🏆 {s.wins} · ⭐ {s.points}
                </div>
              </div>
              <span className="val">{sips(s.sips, settings.drinkMode && !p.noAlcohol)}</span>
            </div>
          );
        })}
        <p className="muted small center">Schlucke zählst du in jedem Spiel über den 🍺-Knopf unten rechts.</p>
      </div>
    </div>
  );
}
