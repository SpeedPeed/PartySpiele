import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PARANOIA } from '../data/paranoia';
import { useDeck, useFill, usePrompts } from '../lib/hooks';
import { useStore, type Player } from '../lib/store';
import { sips } from '../lib/format';
import { buzz, sfx } from '../lib/sound';
import { Button, PassPhone, PlayerChip, PlayerPicker, PromptCard } from '../components/ui';
import type { Level } from '../data/types';
import './mixSpiele.css';

type Phase = 'pass' | 'secret' | 'public' | 'flip' | 'kopf' | 'zahl';

const PENALTY = 2;

export default function Paranoia() {
  const items = usePrompts(PARANOIA, 'paranoia');
  const draw = useDeck('paranoia', items);
  const fill = useFill();
  const { players, settings, addStat } = useStore();

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('pass');
  const [question, setQuestion] = useState<{ text: string; l: Level } | null>(null);
  const [named, setNamed] = useState<string | null>(null);
  const [coinEnd, setCoinEnd] = useState(1800);
  const [round, setRound] = useState(1);
  const flipT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flipT.current) clearTimeout(flipT.current);
  }, []);

  const asker: Player | undefined = players[idx % players.length];
  const target = players.find((p) => p.id === named) ?? null;

  if (!asker) return null;

  const ready = () => {
    const q = draw();
    setQuestion(q ? { text: fill(q.t, asker).text, l: q.l } : null);
    setNamed(null);
    setPhase('secret');
    sfx.card();
  };

  const nextPerson = () => {
    setIdx((i) => (i + 1) % players.length);
    setRound((r) => r + 1);
    setPhase('pass');
    setNamed(null);
    sfx.whoosh();
  };

  const flip = () => {
    const kopf = Math.random() < 0.5;
    // Kopf = Vorderseite (gerade halbe Drehungen), Zahl = Rückseite
    setCoinEnd(1800 + (kopf ? 0 : 180));
    setPhase('flip');
    sfx.drumroll(1.9);
    flipT.current = setTimeout(() => {
      if (kopf) {
        sfx.boom();
        buzz([100, 50, 200]);
        setPhase('kopf');
      } else {
        sfx.coin();
        buzz(40);
        setPhase('zahl');
      }
    }, 2000);
  };

  if (phase === 'pass') return <PassPhone to={`${asker.avatar} ${asker.name}`} onReady={ready} hint="Nur du darfst die Frage lesen – psst! 🤫" />;

  if (phase === 'secret') {
    return (
      <div className="screen">
        <PromptCard kicker="🤫 Streng geheim" text={question?.text ?? 'Keine Fragen für diese Stufen.'} level={question?.l} color="#3dff6e" />
        <h3 className="center">Wen meinst du? Tippen!</h3>
        <PlayerPicker
          players={players.filter((p) => p.id !== asker.id)}
          selected={named ? [named] : []}
          onToggle={(id) => setNamed((n) => (n === id ? null : id))}
        />
        <Button
          big
          block
          color="green"
          disabled={!named}
          onClick={() => {
            sfx.select();
            buzz(60);
            setPhase('public');
          }}
        >
          Name laut sagen 📣
        </Button>
        <p className="muted small center">Danach Handy offen in die Mitte legen – die Frage bleibt versteckt.</p>
      </div>
    );
  }

  const coin = (
    <div className="gx-coin-stage">
      <div className={'gx-coin' + (phase === 'flip' ? ' flip' : '')} style={{ '--end': coinEnd, transform: phase === 'zahl' ? 'rotateY(180deg)' : undefined } as CSSProperties}>
        <div className="face">
          <div>
            <span>👑</span>KOPF
          </div>
        </div>
        <div className="face back">
          <div>
            <span>🍺</span>ZAHL
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="screen centered center">
      <div className="pixel muted" style={{ fontSize: 9 }}>
        RUNDE {round}
      </div>
      <div className="row center wrap">
        <PlayerChip player={asker} />
        <span className="pixel" style={{ fontSize: 10 }}>
          ➜
        </span>
        {target && <PlayerChip player={target} selected />}
      </div>
      <h2 className="gx-pop" style={{ fontSize: 16 }}>
        {asker.name} hat {target?.name ?? '???'} genannt!
      </h2>

      {(phase === 'public' || phase === 'flip') && coin}

      {phase === 'public' && target && (
        <>
          <p>
            {target.name}, willst du wissen, was gefragt wurde? Bei <b style={{ color: 'var(--yellow)' }}>KOPF</b> wird die Frage enthüllt – aber du nimmst{' '}
            {sips(PENALTY, settings.drinkMode && !target.noAlcohol)}.
          </p>
          <Button big block color="yellow" onClick={flip}>
            🪙 Münzwurf wagen
          </Button>
          <Button block color="ghost" onClick={nextPerson}>
            Lieber nicht – weiter
          </Button>
        </>
      )}

      {phase === 'flip' && <div className="pixel gx-blink">Die Münze fliegt …</div>}

      {phase === 'kopf' && target && (
        <>
          <div className="big-num gx-pop">KOPF! 👑</div>
          <PromptCard kicker="💥 Enthüllt" text={question?.text ?? ''} level={question?.l} color="#ff2e88" />
          <div className="notice">
            {target.name} nimmt {sips(PENALTY, settings.drinkMode && !target.noAlcohol)}. Oida, wie peinlich!
          </div>
          <Button
            big
            block
            color="green"
            onClick={() => {
              addStat(target.id, 'sips', PENALTY);
              sfx.coin();
              nextPerson();
            }}
          >
            🍻 Prost – nächste Person
          </Button>
        </>
      )}

      {phase === 'zahl' && (
        <>
          {coin}
          <div className="big-num gx-pop">ZAHL! 🤐</div>
          <p>Glück gehabt – die Frage bleibt für immer ein Geheimnis. Paranoia läuft …</p>
          <Button big block color="green" onClick={nextPerson}>
            Nächste Person ▶
          </Button>
        </>
      )}
    </div>
  );
}
