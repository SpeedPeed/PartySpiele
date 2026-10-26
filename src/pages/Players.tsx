import { useState, type CSSProperties } from 'react';
import { Button, Modal, Toggle, TopBar } from '../components/ui';
import { AVATARS, COLORS, useStore, type Player } from '../lib/store';
import { sfx } from '../lib/sound';

export default function Players() {
  const { players, addPlayer, removePlayer, movePlayer, updatePlayer } = useStore();
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<Player | null>(null);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    sfx.coin();
    addPlayer(n);
    setName('');
  };

  return (
    <div className="app">
      <TopBar title="Spieler" />
      <div className="screen">
        <div className="row">
          <input
            className="input"
            placeholder="Name eingeben …"
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button color="green" onClick={add} disabled={!name.trim()}>
            +
          </Button>
        </div>

        {players.length === 0 && <p className="muted center">Noch niemand da. Wer spielt mit? 🍻</p>}

        <div className="list">
          {players.map((p, i) => (
            <div className="list-item" key={p.id} style={{ boxShadow: `0 0 0 3px var(--shadow), inset 6px 0 0 ${p.color}` } as CSSProperties}>
              <button className="iconbtn" onClick={() => setEdit(p)} style={{ fontSize: 28 }} aria-label="Bearbeiten">
                {p.avatar}
              </button>
              <div className="grow" onClick={() => setEdit(p)}>
                <div style={{ fontSize: 26 }}>{p.name}</div>
                {p.noAlcohol && <div className="small" style={{ color: 'var(--cyan)' }}>🚫🍺 alkoholfrei</div>}
              </div>
              <button className="iconbtn" disabled={i === 0} onClick={() => movePlayer(p.id, -1)} aria-label="Nach oben">
                ▲
              </button>
              <button className="iconbtn" disabled={i === players.length - 1} onClick={() => movePlayer(p.id, 1)} aria-label="Nach unten">
                ▼
              </button>
            </div>
          ))}
        </div>
        <p className="muted small">Die Reihenfolge ist die Sitzreihenfolge (wichtig für „reihum“). Tippe auf eine Person zum Bearbeiten.</p>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Spieler bearbeiten">
        {edit && (
          <div className="col">
            <input className="input" value={edit.name} maxLength={16} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Toggle
              label="🚫🍺 Spielt alkoholfrei"
              hint="Schlucke zählen für diese Person als Strafpunkte (z. B. Fahrer:in)."
              value={edit.noAlcohol}
              onChange={(v) => setEdit({ ...edit, noAlcohol: v })}
            />
            <h3>Avatar</h3>
            <div className="row wrap">
              {AVATARS.map((a) => (
                <button key={a} className="iconbtn" style={{ outline: a === edit.avatar ? '3px solid var(--yellow)' : undefined }} onClick={() => setEdit({ ...edit, avatar: a })}>
                  {a}
                </button>
              ))}
            </div>
            <h3>Farbe</h3>
            <div className="row wrap">
              {COLORS.map((c) => (
                <button key={c} className="iconbtn" aria-label={c} style={{ background: c, outline: c === edit.color ? '3px solid #fff' : undefined }} onClick={() => setEdit({ ...edit, color: c })} />
              ))}
            </div>
            <div className="grid2">
              <Button
                color="red"
                onClick={() => {
                  removePlayer(edit.id);
                  setEdit(null);
                }}
              >
                Löschen
              </Button>
              <Button
                color="green"
                disabled={!edit.name.trim()}
                onClick={() => {
                  updatePlayer(edit.id, { ...edit, name: edit.name.trim() });
                  setEdit(null);
                }}
              >
                Speichern
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
