import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Button, Modal, Panel, Seg, TopBar } from '../components/ui';
import { exText, sips } from '../lib/format';
import { AVATARS, COLORS, useStore } from '../lib/store';
import { uid } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { useWakeLock } from '../lib/hooks';
import { ONLINE_GAMES } from './games';
import { MemberChip } from './kit';
import { supabaseConfig } from './supabase';
import type { Member } from './types';
import { loadIdentity, newRoomCode, saveIdentity, useRoom, type Identity } from './useRoom';

export default function OnlinePage() {
  const { settings, setSettings } = useStore();
  const cfg = supabaseConfig(settings.supabaseUrl, settings.supabaseKey);
  const [params, setParams] = useSearchParams();
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const code = (params.get('code') ?? '').toUpperCase();
  const isHost = params.get('host') === '1';

  if (!cfg.ok) return <SetupBackend onSave={(url, key) => setSettings({ supabaseUrl: url, supabaseKey: key })} />;
  if (!identity) return <IdentityForm onDone={(i) => (saveIdentity(i), setIdentity(i))} />;
  if (!code)
    return (
      <JoinOrCreate
        identity={identity}
        onEditIdentity={() => setIdentity(null)}
        onCreate={() => setParams({ code: newRoomCode(), host: '1' })}
        onJoin={(c) => setParams({ code: c })}
      />
    );
  return <Room key={code + isHost} code={code} isHost={isHost} me={identity} url={cfg.url} anonKey={cfg.key} onLeave={() => setParams({})} />;
}

function SetupBackend({ onSave }: { onSave: (url: string, key: string) => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <div className="app">
      <TopBar title="Multi-Handy" />
      <div className="screen">
        <Panel glow="cyan">
          <h2>📡 Server einrichten</h2>
          <p>
            Für Spiele mit mehreren Handys braucht die App einen kostenlosen <b>Supabase</b>-Server. Einmalig einrichten (5 Minuten):
          </p>
          <ol className="small" style={{ paddingLeft: 20 }}>
            <li>
              Auf <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a> gratis registrieren und ein neues Projekt anlegen.
            </li>
            <li>Im Projekt: <i>Project Settings → API</i> (bzw. „Data API“ / „API Keys“).</li>
            <li>„Project URL“ und den „anon public“-Key (oder „publishable key“) kopieren und hier einfügen.</li>
          </ol>
          <p className="muted small">Tabellen braucht ihr keine – die App nutzt nur Supabase Realtime. Alle Handys müssen dieselben Daten haben (oder der Entwickler hinterlegt sie beim Build).</p>
        </Panel>
        <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="input" placeholder="anon / publishable key" value={key} onChange={(e) => setKey(e.target.value)} />
        <Button color="green" block big disabled={!url.trim().startsWith('http') || key.trim().length < 20} onClick={() => onSave(url.trim(), key.trim())}>
          Speichern
        </Button>
      </div>
    </div>
  );
}

function IdentityForm({ onDone }: { onDone: (i: Identity) => void }) {
  const old = loadIdentity();
  const [name, setName] = useState(old?.name ?? '');
  const [avatar, setAvatar] = useState(old?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [color, setColor] = useState(old?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)]);
  return (
    <div className="app">
      <TopBar title="Wer bist du?" />
      <div className="screen">
        <div className="center avatar-big">{avatar}</div>
        <input className="input" placeholder="Dein Name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <h3>Avatar</h3>
        <div className="row wrap">
          {AVATARS.map((a) => (
            <button key={a} className="iconbtn" style={{ outline: a === avatar ? '3px solid var(--yellow)' : undefined }} onClick={() => (sfx.click(), setAvatar(a))}>
              {a}
            </button>
          ))}
        </div>
        <h3>Farbe</h3>
        <div className="row wrap">
          {COLORS.map((c) => (
            <button key={c} className="iconbtn" style={{ background: c, outline: c === color ? '3px solid #fff' : undefined }} onClick={() => (sfx.click(), setColor(c))} aria-label={c} />
          ))}
        </div>
        <Button color="green" block big disabled={!name.trim()} onClick={() => onDone({ id: old?.id ?? uid(), name: name.trim(), avatar, color })}>
          Los geht’s
        </Button>
      </div>
    </div>
  );
}

function JoinOrCreate({ identity, onCreate, onJoin, onEditIdentity }: { identity: Identity; onCreate: () => void; onJoin: (c: string) => void; onEditIdentity: () => void }) {
  const [code, setCode] = useState('');
  const nav = useNavigate();
  return (
    <div className="app">
      <TopBar title="Multi-Handy" onBack={() => nav('/')} />
      <div className="screen">
        <Panel>
          <div className="row">
            <span style={{ fontSize: 40 }}>{identity.avatar}</span>
            <div className="grow">
              <div className="muted small">Du spielst als</div>
              <div style={{ fontSize: 28, color: identity.color }}>{identity.name}</div>
            </div>
            <Button small color="ghost" onClick={onEditIdentity}>
              Ändern
            </Button>
          </div>
        </Panel>
        <Panel glow="yellow">
          <h2>🕹️ Raum erstellen</h2>
          <p className="small">Du bist Host: Du wählst die Spiele, die anderen treten mit dem Code bei.</p>
          <Button color="yellow" block big onClick={onCreate}>
            Neuen Raum öffnen
          </Button>
        </Panel>
        <Panel glow="cyan">
          <h2>🔑 Raum beitreten</h2>
          <input
            className="input pixel"
            style={{ fontSize: 26, textAlign: 'center', letterSpacing: 8 }}
            placeholder="CODE"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
          <Button color="cyan" block big disabled={code.length !== 4} onClick={() => onJoin(code)}>
            Beitreten
          </Button>
        </Panel>
        <h2>Spiele für mehrere Handys</h2>
        <div className="col" style={{ gap: 8 }}>
          {ONLINE_GAMES.map((g) => (
            <div className="list-item" key={g.id}>
              <span style={{ fontSize: 30 }}>{g.emoji}</span>
              <div className="grow">
                <div style={{ color: g.color }}>{g.name}</div>
                <div className="muted small">{g.tagline} · ab {g.minPlayers}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Room({ code, isHost, me, url, anonKey, onLeave }: { code: string; isHost: boolean; me: Identity; url: string; anonKey: string; onLeave: () => void }) {
  const { settings } = useStore();
  const levels = useMemo(() => settings.levels, [settings.levels]);
  const room = useRoom({ code, me, isHost, url, anonKey, drinkMode: settings.drinkMode, levels });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useWakeLock(true);

  const def = room.room.gameId ? ONLINE_GAMES.find((g) => g.id === room.room.gameId) : undefined;
  const meMember: Member = room.members.find((m) => m.id === me.id) ?? { ...me, host: isHost, joinedAt: 0 };
  const phase = (room.room.game as { phase?: string } | null)?.phase;

  useEffect(() => {
    if (phase) {
      sfx.select();
      buzz(30);
    }
  }, [phase]);

  const fill = useCallback(
    (text: string, names?: { p?: string; p2?: string; p3?: string }) =>
      text
        .replace(/\{p3\}/g, names?.p3 ?? 'jemand anderes')
        .replace(/\{p2\}/g, names?.p2 ?? 'jemand')
        .replace(/\{p\}/g, names?.p ?? 'du')
        .replace(/\{s:(\d+)\}/g, (_, n) => sips(Number(n), room.room.drinkMode))
        .replace(/\{ex\}/g, exText(room.room.drinkMode)),
    [room.room.drinkMode],
  );

  if (room.status === 'error')
    return (
      <div className="app">
        <TopBar title={`Raum ${code}`} onBack={onLeave} />
        <div className="screen centered center">
          <div className="avatar-big">💥</div>
          <h2>Verbindung fehlgeschlagen</h2>
          <p>{room.error}</p>
          <p className="muted small">Prüfe Internet und Supabase-Daten in den Einstellungen.</p>
          <Button color="yellow" onClick={onLeave}>
            Zurück
          </Button>
        </div>
      </div>
    );

  const waitingForHost = !isHost && room.status === 'connected' && room.room.seq < 0;
  const hostGone = !isHost && room.status === 'connected' && room.members.length > 0 && !room.hostPresent;

  return (
    <div className="app">
      <TopBar
        title={def ? `${def.emoji} ${def.name}` : `Raum ${code}`}
        onBack={() => setConfirmLeave(true)}
        right={
          def ? (
            <button className="iconbtn" onClick={() => setRulesOpen(true)} aria-label="Regeln">
              ?
            </button>
          ) : undefined
        }
      />
      <div className="screen">
        {room.status === 'connecting' && <p className="center pulse">Verbinde …</p>}
        {hostGone && <div className="notice">⚠️ Der Host ist gerade nicht verbunden. Warte kurz – oder verlasse den Raum.</div>}
        {waitingForHost && !hostGone && <p className="center pulse">Warte auf den Host …</p>}

        {def && room.room.game != null ? (
          room.members.length < def.minPlayers && isHost ? (
            <MissingPlayers min={def.minPlayers} count={room.members.length} onEnd={room.endGame} />
          ) : (
            <def.View
              state={room.room.game}
              me={meMember}
              isHost={isHost}
              players={room.members}
              send={room.send}
              fill={fill}
              endGame={room.endGame}
              stream={room.stream}
              drinkMode={room.room.drinkMode}
            />
          )
        ) : (
          room.room.seq >= 0 && <Lobby code={code} isHost={isHost} members={room.members} onStart={room.startGame} />
        )}

        {def && isHost && (
          <Button color="ghost" small onClick={room.endGame}>
            ⏹ Spiel beenden / zur Lobby
          </Button>
        )}
      </div>

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="Regeln">
        {def?.rules.map((r, i) => (
          <p key={i}>▸ {r}</p>
        ))}
      </Modal>
      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Raum verlassen?">
        <p>{isHost ? 'Du bist Host – ohne dich ist das Spiel für alle vorbei.' : 'Du kannst mit dem Code jederzeit wieder beitreten.'}</p>
        <Button color="red" block onClick={onLeave}>
          Verlassen
        </Button>
      </Modal>
    </div>
  );
}

function MissingPlayers({ min, count, onEnd }: { min: number; count: number; onEnd: () => void }) {
  return (
    <Panel glow="pink">
      <p>
        Zu wenige Spieler im Raum ({count}/{min}). Wartet auf weitere Leute oder geht zurück zur Lobby.
      </p>
      <Button color="yellow" onClick={onEnd}>
        Zur Lobby
      </Button>
    </Panel>
  );
}

function Lobby({ code, isHost, members, onStart }: { code: string; isHost: boolean; members: Member[]; onStart: (id: string) => void }) {
  const [qr, setQr] = useState('');
  const { settings, setSettings } = useStore();
  const link = `${location.origin}${location.pathname}#/online?code=${code}`;

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#0b0620', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Gaudi Games', text: `Komm in meinen Raum: ${code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        sfx.coin();
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="col">
      <Panel glow="yellow" className="center">
        <div className="muted small">Raum-Code</div>
        <div className="code-display">{code}</div>
        {qr && <img src={qr} alt="QR-Code zum Beitreten" style={{ width: 160, height: 160, imageRendering: 'pixelated', margin: '0 auto', display: 'block' }} />}
        <Button small color="cyan" onClick={share}>
          🔗 Link teilen
        </Button>
      </Panel>

      <h2>Im Raum ({members.length})</h2>
      <div className="row wrap">
        {members.map((m) => (
          <MemberChip key={m.id} m={m} extra={m.host ? <span>👑</span> : null} />
        ))}
      </div>

      {isHost ? (
        <>
          <h2>Einstellungen</h2>
          <Seg
            options={[
              { value: 'drink', label: '🍺 Trinken' },
              { value: 'points', label: '⭐ Strafpunkte' },
            ]}
            value={settings.drinkMode ? 'drink' : 'points'}
            onChange={(v) => setSettings({ drinkMode: v === 'drink' })}
          />
          <p className="muted small">Inhalts-Stufen stellst du in den Einstellungen ein.</p>
          <h2>Spiel wählen</h2>
          <div className="tiles">
            {ONLINE_GAMES.map((g) => {
              const ok = members.length >= g.minPlayers;
              return (
                <button
                  key={g.id}
                  className="tile"
                  style={{ '--tc': g.color, opacity: ok ? 1 : 0.5 } as CSSProperties}
                  onClick={() => {
                    if (!ok) {
                      sfx.fail();
                      return;
                    }
                    sfx.powerup();
                    onStart(g.id);
                  }}
                >
                  <span className="t-emoji">{g.emoji}</span>
                  <span className="t-name">{g.name}</span>
                  <span className="t-tag">{ok ? g.tagline : `Ab ${g.minPlayers} Spielern`}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <Panel>
          <p className="center pulse">Der Host wählt gleich ein Spiel … 🍻</p>
        </Panel>
      )}
    </div>
  );
}
