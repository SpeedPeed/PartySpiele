import { useState } from 'react';
import { Button, Confetti, PlayerChip, RANK_NAME, type PlayingCardData } from '../components/ui';
import { useTurn } from '../lib/hooks';
import { buzz, sfx } from '../lib/sound';
import { useStore } from '../lib/store';
import { FlipCard, LogSipsButton, freshDeck, useSipsFor } from './gameKit';
import './arcadeGames.css';

const BEST_KEY = 'gaudi-hoeher-tiefer-best';

interface Best {
  streak: number;
  name: string;
}

function loadBest(): Best {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) {
      const b = JSON.parse(raw) as Partial<Best>;
      if (typeof b.streak === 'number') return { streak: b.streak, name: b.name ?? '' };
    }
  } catch {
    /* ignore */
  }
  return { streak: 0, name: '' };
}

function saveBest(b: Best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

type Outcome = { kind: 'ok' | 'same' | 'bad'; n: number; card: PlayingCardData } | null;

const cardName = (c: PlayingCardData) => `${RANK_NAME[c.rank] ?? c.rank} ${c.suit}`;

export default function HoeherTiefer() {
  const { players } = useStore();
  const sipsFor = useSipsFor();
  const turn = useTurn();
  const [init] = useState(() => {
    const d = freshDeck();
    return { deck: d.slice(0, -1), card: d[d.length - 1] };
  });
  const [deck, setDeck] = useState<PlayingCardData[]>(init.deck);
  const [card, setCard] = useState<PlayingCardData>(init.card);
  const [flip, setFlip] = useState(0);
  const [streak, setStreak] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [best, setBest] = useState<Best>(loadBest);
  const [newRecord, setNewRecord] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [shuffled, setShuffled] = useState(false);

  const cur = turn.current;
  const waiting = outcome?.kind === 'bad';

  const guess = (up: boolean) => {
    if (waiting) return;
    let d = deck;
    let reshuffled = false;
    if (!d.length) {
      d = freshDeck();
      reshuffled = true;
    }
    const next = d[d.length - 1];
    setDeck(d.slice(0, -1));
    setShuffled(reshuffled);
    const prev = card;
    setCard(next);
    setFlip((f) => f + 1);
    sfx.card();

    if (next.rank === prev.rank) {
      setOutcome({ kind: 'same', n: 1, card: next });
      setTimeout(() => {
        sfx.powerup();
        buzz([60, 40, 60]);
      }, 220);
      return;
    }
    const ok = up ? next.rank > prev.rank : next.rank < prev.rank;
    if (ok) {
      const s = streak + 1;
      setStreak(s);
      setOutcome({ kind: 'ok', n: s, card: next });
      setTimeout(() => (s % 5 === 0 ? sfx.fanfare() : sfx.success()), 220);
      if (s > best.streak) {
        const b = { streak: s, name: cur?.name ?? '' };
        setBest(b);
        saveBest(b);
        if (best.streak > 0 && s === best.streak + 1) setNewRecord((x) => x + 1);
      }
    } else {
      const n = Math.max(1, streak);
      setOutcome({ kind: 'bad', n, card: next });
      setTimeout(() => {
        sfx.fail();
        buzz([150, 60, 250]);
        setShaking(true);
        setTimeout(() => setShaking(false), 450);
      }, 220);
    }
  };

  const passOn = () => {
    setStreak(0);
    setOutcome(null);
    turn.next();
    sfx.whoosh();
  };

  const hot = streak >= 3;

  return (
    <div className={'screen' + (shaking ? ' shake' : '')}>
      <Confetti fire={newRecord} />
      <div className="row between">
        {cur ? <PlayerChip player={cur} selected /> : <span className="ga-kicker">Freies Spiel</span>}
        <span className="pixel" style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'right' }}>
          🏆 {best.streak}
          {best.name ? ` · ${best.name}` : ''}
          <br />
          🂠 {deck.length}
        </span>
      </div>

      <div className={'ga-streak' + (hot ? ' hot' : '')}>
        {streak}
        <span style={{ fontSize: 12 }}> {hot ? '🔥 SERIE' : 'SERIE'}</span>
      </div>

      <div className="ga-card-stage" style={{ minHeight: 240 }}>
        <FlipCard card={card} flipKey={flip} big />
      </div>

      {outcome?.kind === 'ok' && (
        <div className="ga-result ok" key={flip}>
          <div className="ga-big">{streak >= 5 ? 'WAHNSINN! ✔' : 'LEIWAND! ✔'}</div>
          <p>{cardName(outcome.card)} – weiter so!</p>
        </div>
      )}
      {outcome?.kind === 'same' && (
        <div className="ga-result meh" key={flip}>
          <div className="ga-big">GLEICH! 🍻</div>
          <p>Alle trinken {sipsFor(1)}! Die Serie läuft weiter.</p>
        </div>
      )}
      {outcome?.kind === 'bad' && (
        <div className="ga-result bad" key={flip}>
          <div className="ga-big">OIDA! ✘</div>
          <p>
            {cardName(outcome.card)} – {cur ? cur.name : 'du'} kassierst <b>{sipsFor(outcome.n, cur)}</b>
            {streak > 1 ? ` (Serie von ${streak})` : ''}.
          </p>
          <div className="row center">
            <LogSipsButton key={flip} player={cur} n={outcome.n} />
          </div>
        </div>
      )}
      {!outcome && <p className="center muted">Ist die nächste Karte höher oder tiefer? Ass ist hoch.</p>}
      {shuffled && <p className="center muted small">Stapel neu gemischt!</p>}

      {waiting ? (
        <Button color="yellow" big block onClick={passOn}>
          {cur && players.length > 1 ? `Weiter an ${players[(turn.index + 1) % players.length].name} ▶` : 'Neue Serie ▶'}
        </Button>
      ) : (
        <>
          <div className="ga-choices">
            <Button color="green" big onClick={() => guess(true)}>
              ▲ Höher
            </Button>
            <Button color="orange" big onClick={() => guess(false)}>
              ▼ Tiefer
            </Button>
          </div>
          {streak >= 3 && (
            <Button color="cyan" block onClick={passOn}>
              🤝 Weitergeben (Serie sichern)
            </Button>
          )}
          {streak > 0 && streak < 3 && <p className="center muted small">Noch {3 - streak} richtig, dann darfst du weitergeben.</p>}
        </>
      )}
    </div>
  );
}
