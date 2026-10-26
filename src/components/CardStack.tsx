import { useEffect, useState, type ReactNode } from 'react';
import type { Level } from '../data/types';
import { useDeck, useFill } from '../lib/hooks';
import type { Player } from '../lib/store';
import { sfx } from '../lib/sound';
import { Button, PromptCard } from './ui';

/**
 * Generic "draw the next card" game: shows one prompt at a time from a no-repeat deck.
 * Used by simple games like Ich hab noch nie, Wer würde eher, Deep Talk, Zungenbrecher.
 */
export function CardStack<T extends { t: string; l?: Level }>({
  deckKey,
  items,
  kicker,
  format = (x) => x.t,
  color,
  emoji,
  current,
  footer,
  nextLabel = 'Nächste Karte ▶',
  onNext,
}: {
  deckKey: string;
  items: readonly T[];
  kicker?: ReactNode;
  format?: (x: T) => string;
  color?: string;
  emoji?: string;
  current?: Player | null;
  footer?: (card: T) => ReactNode;
  nextLabel?: string;
  onNext?: () => void;
}) {
  const draw = useDeck(deckKey, items);
  const fill = useFill();
  const [card, setCard] = useState<T | undefined>();
  const [text, setText] = useState('');
  const [n, setN] = useState(0);

  const next = () => {
    const c = draw();
    setCard(c);
    setText(c ? fill(format(c), current).text : '');
    setN((x) => x + 1);
    sfx.card();
    onNext?.();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(next, [items]);

  if (!card) return <p className="center muted">Keine Karten für diese Stufen.</p>;
  return (
    <div className="screen">
      <PromptCard kicker={kicker} text={text} level={card.l} color={color} emoji={emoji} cardKey={n} />
      {footer?.(card)}
      <Button color="yellow" block big onClick={next}>
        {nextLabel}
      </Button>
      <p className="muted small center">Karte {n} · {items.length} im Stapel</p>
    </div>
  );
}
