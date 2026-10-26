import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { CATEGORIES, GAMES, type Category } from '../games/registry';
import { ONLINE_META } from '../online/meta';
import { useStore } from '../lib/store';
import { sfx } from '../lib/sound';

const TICKER = [
  'Trinkt verantwortungsvoll – oder zumindest lustig',
  'Wasser ist auch ein Getränk',
  'Wer zuerst kotzt, verliert',
  'Keine Gaudi ohne Jause',
  'Prost, Servus & Habedere',
  'Der Taxischein ist der beste Freund des Menschen',
  'Nein heißt nein – auch bei Pflicht',
];

export default function Home() {
  const nav = useNavigate();
  const { players, settings } = useStore();
  const [cat, setCat] = useState<Category | 'online' | 'alle'>(() => (sessionStorage.getItem('gaudi-cat') as Category) || 'alle');

  const choose = (c: typeof cat) => {
    sfx.click();
    setCat(c);
    sessionStorage.setItem('gaudi-cat', c);
  };

  const showOnline = cat === 'alle' || cat === 'online';
  const list = cat === 'alle' ? GAMES : GAMES.filter((g) => g.category === cat);

  return (
    <div className="app">
      <div className="screen">
        <div className="logo">
          <div className="l1">GAUDI</div>
          <div className="l2">GAMES</div>
          <div className="coin">▶ INSERT BEER TO START ◀</div>
        </div>

        <div className="marquee">
          <span>{TICKER.join('   ★   ')}</span>
        </div>

        <div className="grid2">
          <Button color="yellow" onClick={() => nav('/spieler')}>
            👥 Spieler ({players.length})
          </Button>
          <Button color="green" onClick={() => nav('/online')}>
            📡 Multi-Handy
          </Button>
        </div>
        {players.length === 0 && <div className="notice">Tipp: Trag zuerst eure Namen ein – dann setzt die App sie in Aufgaben ein!</div>}

        <div className="cat-tabs">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={'cat-tab' + (cat === c.id ? ' active' : '')} onClick={() => choose(c.id)}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="tiles">
          {showOnline &&
            ONLINE_META.map((g) => (
              <button
                key={'o-' + g.id}
                className="tile"
                style={{ '--tc': g.color } as CSSProperties}
                onClick={() => {
                  sfx.select();
                  nav('/online');
                }}
              >
                <span className="t-online">ONLINE</span>
                <span className="t-emoji">{g.emoji}</span>
                <span className="t-name">{g.name}</span>
                <span className="t-tag">{g.tagline}</span>
              </button>
            ))}
          {list.map((g) => (
            <button
              key={g.id}
              className="tile"
              style={{ '--tc': g.color } as CSSProperties}
              onClick={() => {
                sfx.select();
                nav('/spiel/' + g.id);
              }}
            >
              <span className="t-emoji">{g.emoji}</span>
              <span className="t-name">{g.name}</span>
              <span className="t-tag">{g.tagline}</span>
            </button>
          ))}
        </div>

        <div className="grid3" style={{ marginTop: 10 }}>
          <Button small color="purple" onClick={() => nav('/statistik')}>
            🏆 Stats
          </Button>
          <Button small color="cyan" onClick={() => nav('/eigene')}>
            ✏️ Eigene
          </Button>
          <Button small color="ghost" onClick={() => nav('/einstellungen')}>
            ⚙️ Setup
          </Button>
        </div>
        <p className="muted small center">
          Modus: {settings.drinkMode ? '🍺 Trinkspiel' : '⭐ Alkoholfrei (Strafpunkte)'} · Bitte trinkt verantwortungsvoll. Ab 18.
        </p>
      </div>
    </div>
  );
}
