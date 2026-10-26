import { Suspense, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Button, Modal, NeedPlayers, SipLogger, TopBar } from '../components/ui';
import { LevelPicker } from '../components/LevelPicker';
import { gameById } from '../games/registry';
import { useWakeLock } from '../lib/hooks';

export default function GamePage() {
  const { id = '' } = useParams();
  const game = gameById(id);
  const [rules, setRules] = useState(false);
  useWakeLock(true);
  if (!game) return <Navigate to="/" replace />;
  const Comp = game.component;
  return (
    <div className="app">
      <TopBar
        title={`${game.emoji} ${game.name}`}
        right={
          <button className="iconbtn" onClick={() => setRules(true)} aria-label="Regeln & Einstellungen">
            ?
          </button>
        }
      />
      <NeedPlayers min={game.minPlayers}>
        <Suspense fallback={<div className="screen centered center pulse">LOADING…</div>}>
          <Comp />
        </Suspense>
        {game.category !== 'tools' && game.id !== 'turnier' && <SipLogger />}
      </NeedPlayers>
      <Modal open={rules} onClose={() => setRules(false)} title="So geht’s">
        {game.rules.map((r, i) => (
          <p key={i}>▸ {r}</p>
        ))}
        {game.levels && (
          <>
            <h2>Stufen</h2>
            <LevelPicker />
          </>
        )}
        <div style={{ height: 12 }} />
        <Button block color="green" onClick={() => setRules(false)}>
          Alles klar!
        </Button>
      </Modal>
    </div>
  );
}
