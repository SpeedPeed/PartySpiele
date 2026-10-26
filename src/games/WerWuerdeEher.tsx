import { CardStack } from '../components/CardStack';
import { WER_WUERDE_EHER } from '../data/werWuerdeEher';
import { usePrompts } from '../lib/hooks';

export default function WerWuerdeEher() {
  const items = usePrompts(WER_WUERDE_EHER, 'werWuerdeEher');
  return (
    <CardStack
      deckKey="werWuerdeEher"
      items={items}
      kicker="Wer würde eher …"
      format={(x) => '… ' + x.t + '?'}
      color="#ffe03a"
      footer={() => <p className="center muted">3 … 2 … 1 … ZEIGEN! 👉 Pro Finger auf dich ein Schluck.</p>}
    />
  );
}
