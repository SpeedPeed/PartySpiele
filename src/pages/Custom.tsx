import { useState } from 'react';
import { Button, LevelBadge, Panel, Seg, TopBar } from '../components/ui';
import type { Level } from '../data/types';
import { LEVELS } from '../lib/format';
import { CUSTOM_LABELS, useStore, type CustomKey } from '../lib/store';
import { sfx } from '../lib/sound';

const HINTS: Record<CustomKey, string> = {
  wahrheit: 'Frage an die Person, die dran ist. z. B. „Wen hier würdest du nie küssen?“',
  pflicht: 'Aufgabe. {p} = wer dran ist, {p2} = jemand anderes. z. B. „Massiere {p2} 30 Sekunden die Schultern.“',
  ichHabNochNie: 'Nur den Rest des Satzes: „… beim Heurigen eingeschlafen“',
  werWuerdeEher: 'Nur den Rest: „… nackt durch den Schnee laufen“',
  paranoia: 'Ganze Frage: „Wer hier hat den schlechtesten Musikgeschmack?“',
  gaudiMix: 'Karte für den Gaudi-Mix. {p}, {p2}, {s:2} (= 2 Schlucke) sind erlaubt.',
  regeln: 'Hausregel: „Wer „Prost“ sagt, nimmt {s:1}.“',
  kategorien: 'Kategorie für die Wortbombe: „Biermarken“',
  heisserStuhl: 'Frage für den heißen Stuhl.',
  gluecksrad: 'Feld fürs Glücksrad: „{p2} trinkt mit“ oder „Lied singen“',
};

export default function Custom() {
  const { custom, addCustom, removeCustom } = useStore();
  const [key, setKey] = useState<CustomKey>('pflicht');
  const [text, setText] = useState('');
  const [level, setLevel] = useState<Level>(2);
  const list = custom[key] ?? [];

  return (
    <div className="app">
      <TopBar title="Eigene Inhalte" />
      <div className="screen">
        <select className="input" value={key} onChange={(e) => setKey(e.target.value as CustomKey)}>
          {(Object.keys(CUSTOM_LABELS) as CustomKey[]).map((k) => (
            <option key={k} value={k}>
              {CUSTOM_LABELS[k]} ({(custom[k] ?? []).length})
            </option>
          ))}
        </select>
        <Panel>
          <p className="muted small">{HINTS[key]}</p>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Dein Text …" maxLength={300} />
          <h3>Stufe</h3>
          <Seg
            options={([1, 2, 3, 4] as Level[]).map((l) => ({ value: l, label: `${LEVELS[l].emoji} ${LEVELS[l].name}` }))}
            value={level}
            onChange={setLevel}
            color={LEVELS[level].color}
          />
          <div style={{ height: 10 }} />
          <Button
            color="green"
            block
            disabled={!text.trim()}
            onClick={() => {
              sfx.coin();
              addCustom(key, { t: text.trim(), l: level });
              setText('');
            }}
          >
            Hinzufügen
          </Button>
        </Panel>
        <h2>
          {CUSTOM_LABELS[key]} ({list.length})
        </h2>
        {list.length === 0 && <p className="muted">Noch nichts Eigenes. Werdet kreativ!</p>}
        <div className="list">
          {list.map((p, i) => (
            <div className="list-item" key={i}>
              <div className="grow">
                <div>{p.t}</div>
                <LevelBadge l={p.l} />
              </div>
              <button className="iconbtn" onClick={() => removeCustom(key, i)} aria-label="Löschen">
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
