import { useState } from 'react';
import { Button, Panel, Toggle, TopBar } from '../components/ui';
import { LevelPicker } from '../components/LevelPicker';
import { useStore } from '../lib/store';
import { supabaseConfig } from '../online/supabase';

export default function Settings() {
  const { settings, setSettings, resetStats } = useStore();
  const [url, setUrl] = useState(settings.supabaseUrl);
  const [key, setKey] = useState(settings.supabaseKey);
  const [saved, setSaved] = useState(false);
  const cfg = supabaseConfig(settings.supabaseUrl, settings.supabaseKey);

  return (
    <div className="app">
      <TopBar title="Einstellungen" />
      <div className="screen">
        <Panel>
          <h2 style={{ marginTop: 0 }}>Spielmodus</h2>
          <Toggle
            label={settings.drinkMode ? '🍺 Trinkspiel-Modus' : '⭐ Alkoholfrei-Modus'}
            hint={settings.drinkMode ? 'Strafen werden in Schlucken angegeben.' : 'Statt Schlucken gibt’s Strafpunkte – perfekt ohne Alkohol.'}
            value={settings.drinkMode}
            onChange={(v) => setSettings({ drinkMode: v })}
          />
        </Panel>

        <Panel>
          <h2 style={{ marginTop: 0 }}>Inhalts-Stufen</h2>
          <p className="muted small">Gilt für alle Spiele mit Fragen & Aufgaben. Mehrfachauswahl möglich.</p>
          <LevelPicker />
        </Panel>

        <Panel>
          <h2 style={{ marginTop: 0 }}>Effekte</h2>
          <Toggle label="🔊 Sound" value={settings.sound} onChange={(v) => setSettings({ sound: v })} />
          <Toggle label="📳 Vibration" value={settings.vibration} onChange={(v) => setSettings({ vibration: v })} />
          <Toggle label="📺 Röhrenfernseher-Effekt" value={settings.scanlines} onChange={(v) => setSettings({ scanlines: v })} />
        </Panel>

        <Panel>
          <h2 style={{ marginTop: 0 }}>📡 Multi-Handy-Server</h2>
          {cfg.ok && !settings.supabaseUrl ? (
            <p className="ok-notice small">Ein Server ist bereits fest eingebaut. Du kannst ihn hier optional überschreiben.</p>
          ) : (
            <p className="muted small">Supabase Project URL und anon/publishable Key (siehe Anleitung unter Multi-Handy).</p>
          )}
          <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} style={{ marginBottom: 8 }} />
          <input className="input" placeholder="anon key" value={key} onChange={(e) => setKey(e.target.value)} />
          <Button
            color="cyan"
            block
            onClick={() => {
              setSettings({ supabaseUrl: url.trim(), supabaseKey: key.trim() });
              setSaved(true);
            }}
          >
            {saved ? '✔ Gespeichert' : 'Speichern'}
          </Button>
        </Panel>

        <Panel>
          <h2 style={{ marginTop: 0 }}>Daten</h2>
          <Button
            color="red"
            block
            onClick={() => {
              if (confirm('Alle Statistiken des Abends löschen?')) resetStats();
            }}
          >
            Statistik zurücksetzen
          </Button>
        </Panel>

        <p className="muted small center">
          Gaudi Games · Alle Daten bleiben auf deinem Handy.
          <br />
          Bitte trinkt verantwortungsvoll. Niemand muss etwas tun, das er/sie nicht will.
        </p>
      </div>
    </div>
  );
}
