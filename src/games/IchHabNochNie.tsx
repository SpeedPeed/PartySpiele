import { CardStack } from '../components/CardStack';
import { ICH_HAB_NOCH_NIE } from '../data/ichHabNochNie';
import { usePrompts } from '../lib/hooks';
import { useStore } from '../lib/store';
import { sips } from '../lib/format';

export default function IchHabNochNie() {
  const items = usePrompts(ICH_HAB_NOCH_NIE, 'ichHabNochNie');
  const { settings } = useStore();
  return (
    <CardStack
      deckKey="ichHabNochNie"
      items={items}
      kicker="Ich hab noch nie …"
      format={(x) => '… ' + x.t + '.'}
      color="#19e3ff"
      footer={() => <p className="center muted">Wer es schon getan hat: {sips(1, settings.drinkMode)}!</p>}
    />
  );
}
