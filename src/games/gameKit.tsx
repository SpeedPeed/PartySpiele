import { useEffect, useRef, useState } from 'react';
import { Button, newDeck, PlayingCard, type PlayingCardData } from '../components/ui';
import { sips } from '../lib/format';
import { shuffle } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { useStore, type Player } from '../lib/store';

/** Gemischter Stapel aus n × 52 Karten. */
export function freshDeck(n = 1): PlayingCardData[] {
  const all: PlayingCardData[] = [];
  for (let i = 0; i < n; i++) all.push(...newDeck());
  return shuffle(all);
}

/** Schluck-/Strafpunkt-Text für eine bestimmte Person (berücksichtigt "alkoholfrei"). */
export function useSipsFor() {
  const { settings } = useStore();
  return (n: number, p?: Player | null) => sips(n, settings.drinkMode && !p?.noAlcohol);
}

/**
 * Spielkarte mit Flip-Animation. Ändert sich `flipKey`, dreht sich die alte Karte weg
 * und die neue (`card`) dreht sich herein.
 */
export function FlipCard({ card, flipKey, big, small, hidden }: { card: PlayingCardData | null | undefined; flipKey: string | number; big?: boolean; small?: boolean; hidden?: boolean }) {
  const [shown, setShown] = useState(card);
  const [shownKey, setShownKey] = useState(flipKey);
  const [stage, setStage] = useState<'' | 'out' | 'in'>('');
  const latest = useRef(card);
  latest.current = card;

  useEffect(() => {
    if (flipKey === shownKey) return;
    setStage('out');
    const t = setTimeout(() => {
      setShown(latest.current);
      setShownKey(flipKey);
      setStage('in');
    }, 190);
    return () => clearTimeout(t);
  }, [flipKey, shownKey]);

  // Hidden toggles (z. B. aufdecken ohne neue Karte) sofort übernehmen
  const showCard = flipKey === shownKey ? card : shown;

  return (
    <div className={big ? 'ga-card-big' : undefined}>
      <div key={String(shownKey)} className={stage === 'out' ? 'ga-flip-out' : stage === 'in' ? 'ga-flip-in' : undefined}>
        <PlayingCard card={showCard} small={small} hidden={hidden || !showCard} />
      </div>
    </div>
  );
}

/** Button zum Eintragen einer Strafe in die Statistik (einmalig). */
export function LogSipsButton({ player, n, label }: { player: Player | null | undefined; n: number; label?: string }) {
  const { addStat } = useStore();
  const [done, setDone] = useState(false);
  if (!player || n <= 0) return null;
  return (
    <Button
      small
      color={done ? 'ghost' : 'yellow'}
      disabled={done}
      silent
      onClick={() => {
        sfx.coin();
        buzz(20);
        addStat(player.id, 'sips', n);
        setDone(true);
      }}
    >
      {done ? '✔ Notiert' : label ?? `📝 ${player.name} +${n}`}
    </Button>
  );
}
