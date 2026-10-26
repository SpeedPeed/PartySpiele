import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Confetti, Modal, PlayerChip, Rich, RANK_NAME, rankLabel, type PlayingCardData } from '../components/ui';
import { RING_OF_FIRE, RING_OF_FIRE_HARMLOS, type RofCard } from '../data/ringOfFire';
import { useFill, useTurn } from '../lib/hooks';
import { buzz, sfx } from '../lib/sound';
import { useStore, type Player } from '../lib/store';
import { FlipCard, freshDeck } from './gameKit';
import './arcadeGames.css';

/** Rang aus den Daten ('Ass', '2'..'10', 'Bube', 'Dame', 'König' – auch A/J/Q/K etc.) → 2..14 */
function rankNum(r: unknown): number | null {
  const s = String(r ?? '')
    .trim()
    .toLowerCase();
  if (['ass', 'a', 'ace', 'as', '1', '14'].includes(s)) return 14;
  if (['bube', 'b', 'j', 'jack', 'bauer', '11'].includes(s)) return 11;
  if (['dame', 'd', 'q', 'queen', '12'].includes(s)) return 12;
  if (['könig', 'koenig', 'konig', 'k', 'king', '13'].includes(s)) return 13;
  const n = parseInt(s, 10);
  return n >= 2 && n <= 10 ? n : null;
}

function buildRules(list: readonly RofCard[]): Map<number, RofCard> {
  const m = new Map<number, RofCard>();
  list.forEach((c, i) => {
    const n = rankNum(c.rank) ?? (i === 0 ? 14 : i + 1 <= 13 ? i + 1 : null);
    if (n && !m.has(n)) m.set(n, c);
  });
  return m;
}

const ORDER = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

interface Drawn {
  card: PlayingCardData;
  rule: RofCard | undefined;
  text: string;
  by: Player | null;
  kings: number;
}

export default function RingOfFire() {
  const { settings, players } = useStore();
  const fill = useFill();
  const turn = useTurn();
  const rules = useMemo(() => buildRules(settings.drinkMode ? RING_OF_FIRE : RING_OF_FIRE_HARMLOS), [settings.drinkMode]);

  const [deck, setDeck] = useState<PlayingCardData[]>(() => freshDeck());
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [n, setN] = useState(0);
  const [kings, setKings] = useState(0);
  const [finale, setFinale] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const draw = () => {
    if (!deck.length || finale || kings >= 4) return;
    const [card, ...rest] = deck;
    const by = turn.current;
    const rule = rules.get(card.rank);
    const k = card.rank === 13 ? kings + 1 : kings;
    setDeck(rest);
    setKings(k);
    setN((x) => x + 1);
    setDrawn({ card, rule, text: rule ? fill(rule.rule, by).text : '', by, kings: k });
    turn.next();
    sfx.card();
    buzz(20);
    if (card.rank === 13) {
      if (k >= 4) {
        setTimeout(() => {
          sfx.drumroll(0.8);
          setTimeout(() => {
            sfx.boom();
            buzz([300, 80, 300, 80, 600]);
            setFinale(true);
            setConfetti((c) => c + 1);
            setTimeout(() => sfx.fanfare(), 600);
          }, 800);
        }, 350);
      } else setTimeout(() => sfx.powerup(), 250);
    }
  };

  const restart = () => {
    setDeck(freshDeck());
    setDrawn(null);
    setKings(0);
    setN(0);
    setFinale(false);
    setConfirmNew(false);
    sfx.whoosh();
  };

  const next = turn.current;
  const rankTitle = drawn ? `${RANK_NAME[drawn.card.rank] ?? drawn.card.rank} ${drawn.card.suit}` : '';
  const isKing = drawn?.card.rank === 13;

  return (
    <div className="screen">
      <Confetti fire={confetti} />

      <div className="row between">
        <div className="ga-kings" aria-label={`${kings} von 4 Königen`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < kings ? 'on' : ''}>
              👑
            </span>
          ))}
        </div>
        <div className="pixel" style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
          🂠 {deck.length}/52
          <br />
          <span style={{ color: 'var(--yellow)' }}>{kings}/4 KÖNIGE</span>
        </div>
      </div>

      <div className="ga-card-stage" onClick={draw} style={{ cursor: deck.length && kings < 4 ? 'pointer' : 'default' }}>
        <FlipCard card={drawn?.card} flipKey={n} big hidden={!drawn} />
      </div>

      {drawn ? (
        <div className="card ga-pop" key={n} style={{ '--cc': isKing ? 'var(--yellow)' : drawn.card.suit === '♥' || drawn.card.suit === '♦' ? 'var(--pink)' : 'var(--cyan)', minHeight: 0, margin: '4px 12px 8px' } as CSSProperties}>
          <div className="card-kicker">
            {rankTitle}
            {drawn.by ? ` · ${drawn.by.avatar} ${drawn.by.name}` : ''}
          </div>
          <div className="pixel" style={{ fontSize: 15, color: 'var(--yellow)' }}>
            {drawn.rule?.title ?? 'Freie Karte'}
          </div>
          <div className="card-text" style={{ fontSize: 25 }}>
            <Rich text={drawn.text || 'Für diese Karte gibt’s keine Regel – Prost trotzdem!'} />
          </div>
          {isKing && drawn.kings < 4 && (
            <div className="notice" style={{ fontSize: 19 }}>
              👑 König Nr. {drawn.kings}! Schütte etwas von deinem Getränk in den Kings Cup.
            </div>
          )}
        </div>
      ) : (
        <div className="panel center">
          <p className="ga-kicker">Karten im Kreis um den Kings Cup!</p>
          <p className="muted">Tippe auf den Stapel oder den Button, um die erste Karte zu ziehen.</p>
        </div>
      )}

      {deck.length > 0 && kings < 4 ? (
        <>
          {next && (
            <div className="row center">
              <span className="muted small">Als Nächstes zieht</span>
              <PlayerChip player={next} selected />
            </div>
          )}
          <Button color="yellow" big block onClick={draw}>
            🂠 Karte ziehen
          </Button>
        </>
      ) : (
        <div className="col">
          <div className="ok-notice center">{kings >= 4 ? 'Kings Cup ist erledigt – na servas!' : 'Stapel leer! Leiwand gespielt.'}</div>
          <Button color="green" big block onClick={restart}>
            🔄 Neues Spiel
          </Button>
        </div>
      )}

      <div className="grid2">
        <Button color="cyan" small onClick={() => setShowRules(true)}>
          📜 Regelübersicht
        </Button>
        <Button color="ghost" small onClick={() => (n ? setConfirmNew(true) : restart())}>
          🔄 Neues Spiel
        </Button>
      </div>
      {players.length === 0 && <p className="muted small center">Tipp: Trag Spieler ein, dann zeigt die App, wer dran ist.</p>}

      <Modal open={showRules} onClose={() => setShowRules(false)} title="Kartenregeln">
        <div className="list">
          {ORDER.map((r) => {
            const rule = rules.get(r);
            return (
              <div className="list-item" key={r} style={{ alignItems: 'flex-start' }}>
                <div className="pixel" style={{ fontSize: 14, width: 38, color: r === 13 ? 'var(--yellow)' : 'var(--cyan)' }}>
                  {rankLabel(r)}
                </div>
                <div className="grow">
                  <div style={{ color: 'var(--yellow)' }}>
                    {RANK_NAME[r] ?? r} · {rule?.title ?? '–'}
                  </div>
                  <div className="small">
                    <Rich text={rule ? fill(rule.rule, null).text : ''} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal open={confirmNew} onClose={() => setConfirmNew(false)} title="Neu mischen?">
        <p>Alle Karten zurück in den Stapel und die Könige auf 0?</p>
        <div className="grid2">
          <Button color="ghost" onClick={() => setConfirmNew(false)}>
            Doch nicht
          </Button>
          <Button color="red" onClick={restart}>
            Neu mischen
          </Button>
        </div>
      </Modal>

      {finale && drawn && (
        <div className="ga-finale" onClick={() => setFinale(false)}>
          <div style={{ fontSize: 80 }}>🍺👑🍺</div>
          <div className="ga-title">KINGS CUP!</div>
          <p style={{ fontSize: 28 }}>
            {drawn.by ? (
              <>
                <span style={{ color: 'var(--yellow)' }}>
                  {drawn.by.avatar} {drawn.by.name}
                </span>{' '}
                hat den 4. König gezogen
              </>
            ) : (
              'Der 4. König ist gefallen'
            )}
            {settings.drinkMode ? ' und trinkt den Kings Cup – auf Ex! Oida!' : ' und kassiert 10 Strafpunkte! Oida!'}
          </p>
          <Button color="yellow" big onClick={() => setFinale(false)}>
            Prost! 🍻
          </Button>
        </div>
      )}
    </div>
  );
}
