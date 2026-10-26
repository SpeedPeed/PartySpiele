import { CardStack } from '../components/CardStack';
import { DEEP_TALK } from '../data/fragenRunde';
import { usePrompts } from '../lib/hooks';

export default function DeepTalk() {
  const items = usePrompts(DEEP_TALK);
  return <CardStack deckKey="deepTalk" items={items} kicker="Deep Talk" color="#a64dff" emoji="🌙" nextLabel="Nächste Frage ▶" />;
}
