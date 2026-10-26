import { useRef, useState } from 'react';
import { Button, Confetti, PlayerChip, PlayingCard, RANK_NAME, isRed, rankLabel, type PlayingCardData } from '../components/ui';
import { pick } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { useStore, type Player } from '../lib/store';
import { FlipCard, LogSipsButton, freshDeck, useSipsFor } from './gameKit';
import './arcadeGames.css';

type Card = PlayingCardData;
type Phase = 'intro' | 'r1' | 'r2' | 'reveal' | 'r3' | 'won';

const cardName = (c: Card) => `${RANK_NAME[c.rank] ?? c.rank} ${c.suit}`;
const short = (c: Card) => `${rankLabel(c.rank)}${c.suit}`;

/** Pyramide: Index 0-3 = Reihe 1 (unten), 4-6 = Reihe 2, 7-8 = Reihe 3, 9 = Reihe 4 (Spitze). */
const ROWS: number[][] = [[0, 1, 2, 3], [4, 5, 6], [7, 8], [9]];
const rowOf = (i: number) => (i < 4 ? 1 : i < 7 ? 2 : i < 9 ? 3 : 4);

interface Opt {
  v: string;
  label: string;
  color: 'pink' | 'cyan' | 'yellow' | 'green' | 'orange' | 'red' | 'purple' | 'ghost';
  suit?: boolean;
}

const QUESTIONS: { title: string; hint: string; opts: Opt[] }[] = [
  {
    title: 'Rot oder Schwarz?',
    hint: 'Frage 1 · falsch = 1',
    opts: [
      { v: 'rot', label: '🟥 Rot', color: 'red' },
      { v: 'schwarz', label: '⬛ Schwarz', color: 'ghost' },
    ],
  },
  {
    title: 'Höher oder tiefer als deine 1. Karte?',
    hint: 'Frage 2 · falsch = 2 · gleich zählt als falsch',
    opts: [
      { v: 'hoeher', label: '▲ Höher', color: 'green' },
      { v: 'tiefer', label: '▼ Tiefer', color: 'orange' },
    ],
  },
  {
    title: 'Innerhalb oder außerhalb deiner ersten zwei?',
    hint: 'Frage 3 · falsch = 3 · Grenzwert zählt als falsch',
    opts: [
      { v: 'innen', label: '⇥⇤ Innerhalb', color: 'cyan' },
      { v: 'aussen', label: '⇤⇥ Außerhalb', color: 'purple' },
    ],
  },
  {
    title: 'Welche Farbe?',
    hint: 'Frage 4 · falsch = 4',
    opts: [
      { v: '♥', label: '♥', color: 'red', suit: true },
      { v: '♦', label: '♦', color: 'red', suit: true },
      { v: '♣', label: '♣', color: 'ghost', suit: true },
      { v: '♠', label: '♠', color: 'ghost', suit: true },
    ],
  },
];

function evaluate(q: number, ans: string, card: Card, hand: Card[]): boolean {
  switch (q) {
    case 0:
      return (ans === 'rot') === isRed(card);
    case 1: {
      const ref = hand[0].rank;
      return ans === 'hoeher' ? card.rank > ref : card.rank < ref;
    }
    case 2: {
      const lo = Math.min(hand[0].rank, hand[1].rank);
      const hi = Math.max(hand[0].rank, hand[1].rank);
      return ans === 'innen' ? card.rank > lo && card.rank < hi : card.rank < lo || card.rank > hi;
    }
    default:
      return card.suit === ans;
  }
}

interface R1Result {
  ok: boolean;
  card: Card;
  n: number;
}

interface Match {
  card: Card;
  row: number;
  hits: { player: Player; cards: Card[] }[];
}

function Hand({ cards, highlight }: { cards: Card[]; highlight?: number }) {
  if (!cards.length) return <span className="muted small">– leer –</span>;
  return (
    <div className="ga-hand" style={{ minHeight: 0 }}>
      {cards.map((c, i) => (
        <div key={i} className={highlight === c.rank ? 'ga-slot-hl' : undefined}>
          <PlayingCard card={c} small />
        </div>
      ))}
    </div>
  );
}

function Phases({ phase }: { phase: Phase }) {
  const cur = phase === 'r1' ? 0 : phase === 'r2' ? 1 : phase === 'intro' ? -1 : 2;
  return (
    <div className="row" style={{ gap: 6 }}>
      {['1 · FRAGEN', '2 · PYRAMIDE', '3 · BUS'].map((l, i) => (
        <div
          key={l}
          className="pixel"
          style={{
            flex: 1,
            fontSize: 8,
            padding: '8px 4px',
            textAlign: 'center',
            background: i === cur ? 'var(--yellow)' : i < cur ? '#0f5a26' : 'var(--panel)',
            color: i === cur ? '#2a1600' : i < cur ? 'var(--green)' : 'var(--muted)',
            boxShadow: '0 0 0 3px var(--shadow)',
          }}
        >
          {i < cur ? '✔ ' : ''}
          {l}
        </div>
      ))}
    </div>
  );
}

export default function Busfahrer() {
  const { players, addStat } = useStore();
  const sipsFor = useSipsFor();
  const numDecks = players.length > 7 ? 2 : 1;
  const deckRef = useRef<Card[]>([]);
  const [deckLeft, setDeckLeft] = useState(52 * numDecks);
  const draw = (): Card => {
    if (!deckRef.current.length) deckRef.current = freshDeck(numDecks);
    const c = deckRef.current.pop()!;
    setDeckLeft(deckRef.current.length);
    return c;
  };

  const [phase, setPhase] = useState<Phase>('intro');
  const [hands, setHands] = useState<Record<string, Card[]>>({});
  const [confetti, setConfetti] = useState(0);
  const [shaking, setShaking] = useState(false);
  const doShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 450);
  };

  // Runde 1
  const [pi, setPi] = useState(0);
  const [q, setQ] = useState(0);
  const [res, setRes] = useState<R1Result | null>(null);
  const [flip, setFlip] = useState(0);

  // Runde 2
  const [pyramid, setPyramid] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [match, setMatch] = useState<Match | null>(null);

  // Runde 3
  const [driverId, setDriverId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [base, setBase] = useState<Card | null>(null);
  const [bus, setBus] = useState<Card[]>([]);
  const [busPos, setBusPos] = useState(0);
  const [busFail, setBusFail] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(1);
  const [busSips, setBusSips] = useState(0);

  const player = players[pi % Math.max(1, players.length)];
  const driver = players.find((p) => p.id === driverId) ?? null;

  const start = () => {
    deckRef.current = freshDeck(numDecks);
    setDeckLeft(deckRef.current.length);
    setHands(Object.fromEntries(players.map((p) => [p.id, []])));
    setPi(0);
    setQ(0);
    setRes(null);
    setPyramid([]);
    setRevealed(0);
    setMatch(null);
    setDriverId(null);
    setPhase('r1');
    sfx.select();
  };

  // ---------- Runde 1 ----------
  const answer = (v: string) => {
    if (res || !player) return;
    const hand = hands[player.id] ?? [];
    const card = draw();
    const ok = evaluate(q, v, card, hand);
    setHands((h) => ({ ...h, [player.id]: [...(h[player.id] ?? []), card] }));
    setRes({ ok, card, n: q + 1 });
    setFlip((f) => f + 1);
    sfx.card();
    setTimeout(() => {
      if (ok) sfx.success();
      else {
        sfx.fail();
        buzz([80, 40, 160]);
        doShake();
      }
    }, 260);
  };

  const nextQ = () => {
    setRes(null);
    if (q < 3) {
      setQ(q + 1);
      return;
    }
    if (pi + 1 < players.length) {
      setPi(pi + 1);
      setQ(0);
      sfx.whoosh();
      return;
    }
    // → Pyramide
    setPyramid(Array.from({ length: 10 }, () => draw()));
    setRevealed(0);
    setMatch(null);
    setPhase('r2');
    sfx.powerup();
  };

  // ---------- Runde 2 ----------
  const reveal = () => {
    if (revealed >= 10) return;
    const card = pyramid[revealed];
    const row = rowOf(revealed);
    const hits: Match['hits'] = [];
    const nh: Record<string, Card[]> = {};
    for (const p of players) {
      const h = hands[p.id] ?? [];
      const same = h.filter((c) => c.rank === card.rank);
      if (same.length) hits.push({ player: p, cards: same });
      nh[p.id] = h.filter((c) => c.rank !== card.rank);
    }
    setHands(nh);
    setMatch({ card, row, hits });
    setRevealed(revealed + 1);
    sfx.card();
    buzz(25);
    if (hits.length) setTimeout(() => sfx.coin(), 250);
  };

  const findDriver = () => {
    const max = Math.max(...players.map((p) => (hands[p.id] ?? []).length));
    const cands = players.filter((p) => (hands[p.id] ?? []).length === max);
    const d = pick(cands);
    setDriverId(d.id);
    setPhase('reveal');
    setRolling(true);
    sfx.drumroll(1.6);
    setTimeout(() => {
      setRolling(false);
      sfx.fanfare();
      buzz([100, 50, 100]);
    }, 1700);
  };

  // ---------- Runde 3 ----------
  const newBus = () => {
    setBase(draw());
    setBus(Array.from({ length: 5 }, () => draw()));
    setBusPos(0);
    setBusFail(null);
    setFlip((f) => f + 1);
    sfx.whoosh();
  };

  const startBus = () => {
    setAttempts(1);
    setBusSips(0);
    newBus();
    setPhase('r3');
  };

  const guessBus = (up: boolean) => {
    if (busFail !== null || busPos >= 5 || !base) return;
    const prev = busPos === 0 ? base : bus[busPos - 1];
    const cur = bus[busPos];
    const ok = up ? cur.rank > prev.rank : cur.rank < prev.rank;
    sfx.card();
    if (ok) {
      const np = busPos + 1;
      setBusPos(np);
      if (np >= 5) {
        setTimeout(() => {
          sfx.fanfare();
          buzz([100, 50, 100, 50, 300]);
          setConfetti((c) => c + 1);
          setPhase('won');
        }, 500);
      } else setTimeout(() => sfx.success(), 150);
    } else {
      setBusFail(busPos);
      setBusSips((s) => s + busPos + 1);
      setTimeout(() => {
        sfx.fail();
        buzz([200, 60, 200]);
        doShake();
      }, 150);
    }
  };

  const retryBus = () => {
    setAttempts((a) => a + 1);
    newBus();
  };

  // ---------- Render ----------
  if (phase === 'intro') {
    return (
      <div className="screen">
        <div className="center ga-pop">
          <div className="avatar-big">🚌</div>
          <div className="ga-title">BUSFAHRER</div>
        </div>
        <div className="panel">
          <h3>Runde 1 · 4 Fragen</h3>
          <p className="small">Rot/Schwarz → Höher/Tiefer → Innerhalb/Außerhalb → Farbe. Falsch = 1/2/3/4 {sipsFor(2).replace(/^2 /, '')}. Die Karten wandern in deine Hand.</p>
          <h3>Runde 2 · Pyramide</h3>
          <p className="small">10 Karten, unten beginnend. Wer den gleichen Rang auf der Hand hat, legt ab und verteilt (Reihe = Anzahl).</p>
          <h3>Runde 3 · Busfahrt</h3>
          <p className="small">Wer die meisten Karten übrig hat, fährt Bus: 5× Höher/Tiefer am Stück. Falsch = von vorne!</p>
        </div>
        <div className="row wrap center">
          {players.map((p) => (
            <PlayerChip key={p.id} player={p} />
          ))}
        </div>
        {numDecks > 1 && <p className="muted small center">Viele Mitfahrer – es wird mit 2 Decks gespielt.</p>}
        <Button color="yellow" big block onClick={start}>
          🚌 Einsteigen bitte!
        </Button>
      </div>
    );
  }

  const handsPanel = (highlight?: number, hits?: Set<string>) => (
    <div className="list">
      {players.map((p) => (
        <div
          className="list-item"
          key={p.id}
          style={{ padding: '6px 10px', boxShadow: hits?.has(p.id) ? '0 0 0 3px var(--yellow)' : p.id === player?.id && phase === 'r1' ? '0 0 0 3px var(--cyan)' : undefined }}
        >
          <span style={{ fontSize: 24 }}>{p.avatar}</span>
          <div style={{ width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div className="grow">
            <Hand cards={hands[p.id] ?? []} highlight={highlight} />
          </div>
          <span className="pixel" style={{ fontSize: 10, color: 'var(--yellow)' }}>
            {(hands[p.id] ?? []).length}
          </span>
        </div>
      ))}
    </div>
  );

  if (phase === 'r1' && player) {
    const Q = QUESTIONS[q];
    const hand = hands[player.id] ?? [];
    const sipsN = res ? res.n : q + 1;
    return (
      <div className={'screen' + (shaking ? ' shake' : '')}>
        <Phases phase={phase} />
        <div className="row between">
          <PlayerChip player={player} selected />
          <span className="pixel" style={{ fontSize: 9, color: 'var(--muted)' }}>
            Spieler {pi + 1}/{players.length} · 🂠 {deckLeft}
          </span>
        </div>

        <div className="row center" style={{ gap: 8, minHeight: 90 }}>
          {[0, 1, 2, 3].map((i) => {
            const c = hand[i];
            const isNew = res && i === hand.length - 1;
            return (
              <div key={i} className={i === q && !res ? 'ga-slot-hl' : isNew ? (res!.ok ? 'ga-slot-ok' : 'ga-slot-bad') : undefined}>
                {isNew ? <FlipCard card={c} flipKey={flip} small /> : <PlayingCard card={c} small hidden={!c} />}
              </div>
            );
          })}
        </div>

        <div className="ga-kicker">{Q.hint}</div>
        <div className="pixel center" style={{ fontSize: 14, color: 'var(--yellow)', lineHeight: 1.5 }}>
          {Q.title}
        </div>

        {!res ? (
          <div className={'ga-choices' + (Q.opts.length === 4 ? ' four' : '')}>
            {Q.opts.map((o) => (
              <Button key={o.v} color={o.color} onClick={() => answer(o.v)} style={o.suit ? { fontSize: 32, fontFamily: 'var(--body)' } : undefined}>
                {o.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className={'ga-result ' + (res.ok ? 'ok' : 'bad')}>
            <div className="ga-big">{res.ok ? 'LEIWAND! ✔' : 'OIDA! ✘'}</div>
            <p>
              Gezogen: <b>{cardName(res.card)}</b>
            </p>
            {res.ok ? (
              <p>Du darfst {sipsFor(sipsN)} verteilen!</p>
            ) : (
              <p>
                {player.name} kassiert <b>{sipsFor(sipsN, player)}</b>.
              </p>
            )}
            {!res.ok && <LogSipsButton key={`${pi}-${q}`} player={player} n={sipsN} />}
          </div>
        )}
        {res && (
          <Button color="yellow" big block onClick={nextQ}>
            {q < 3 ? 'Nächste Frage ▶' : pi + 1 < players.length ? `Weiter zu ${players[pi + 1].name} ▶` : 'Ab zur Pyramide ▲'}
          </Button>
        )}

        <h3>Handkarten</h3>
        {handsPanel()}
      </div>
    );
  }

  if (phase === 'r2') {
    const hitSet = new Set(match?.hits.map((h) => h.player.id));
    return (
      <div className="screen">
        <Phases phase={phase} />
        <div className="ga-pyr" style={{ paddingLeft: 40 }}>
          {[...ROWS].reverse().map((row) => (
            <div className="ga-pyr-row" key={row[0]}>
              <span className="ga-sips">{rowOf(row[0])}×</span>
              {row.map((i) => (
                <div key={i} className={i === revealed - 1 ? 'ga-slot-hl' : undefined}>
                  {i === revealed - 1 ? <FlipCard card={pyramid[i]} flipKey={revealed} small /> : <PlayingCard card={pyramid[i]} small hidden={i >= revealed} />}
                </div>
              ))}
            </div>
          ))}
        </div>

        {match ? (
          <div className={'ga-result ' + (match.hits.length ? 'meh' : 'ok')} key={revealed}>
            <div className="ga-big">
              {cardName(match.card)} · Reihe {match.row}
            </div>
            {match.hits.length ? (
              match.hits.map((h) => (
                <p key={h.player.id}>
                  {h.player.avatar} <b>{h.player.name}</b> legt {h.cards.map(short).join(' ')} ab → verteilt <b>{sipsFor(h.cards.length * match.row)}</b>!
                </p>
              ))
            ) : (
              <p>Niemand hat eine {RANK_NAME[match.card.rank] ?? match.card.rank} – Glück gehabt!</p>
            )}
          </div>
        ) : (
          <div className="panel center small">Reihe 1 (unten) = 1, Spitze = 4 zum Verteilen. Wer passende Karten hat, wird automatisch angezeigt.</div>
        )}

        {revealed < 10 ? (
          <Button color="yellow" big block onClick={reveal}>
            🂠 Karte {revealed + 1}/10 aufdecken
          </Button>
        ) : (
          <Button color="pink" big block onClick={findDriver}>
            🚌 Wer fährt Bus?
          </Button>
        )}

        <h3>Handkarten</h3>
        {handsPanel(match?.card.rank, hitSet)}
      </div>
    );
  }

  if (phase === 'reveal') {
    const sorted = [...players].sort((a, b) => (hands[b.id] ?? []).length - (hands[a.id] ?? []).length);
    return (
      <div className="screen centered center">
        <Phases phase={phase} />
        {rolling ? (
          <>
            <div className="avatar-big pulse">🥁</div>
            <div className="ga-title ga-blink">Wer fährt Bus…?</div>
          </>
        ) : (
          driver && (
            <>
              <div className="avatar-big ga-pop" style={{ fontSize: 90 }}>
                {driver.avatar}
              </div>
              <div className="ga-kicker">Busfahrer:in ist</div>
              <div className="ga-title xl ga-pop">{driver.name}</div>
              <p className="muted">mit {(hands[driver.id] ?? []).length} Karten übrig. Na servas! 🚌</p>
              <div className="list" style={{ textAlign: 'left' }}>
                {sorted.map((p) => (
                  <div className="score-row" key={p.id}>
                    <span style={{ fontSize: 22 }}>{p.avatar}</span>
                    <span className="grow">{p.name}</span>
                    <span className="val">{(hands[p.id] ?? []).length} 🂠</span>
                  </div>
                ))}
              </div>
              <Button color="yellow" big block onClick={startBus}>
                Losfahren ▶
              </Button>
            </>
          )
        )}
      </div>
    );
  }

  if (phase === 'r3' && driver && base) {
    const failed = busFail !== null;
    const prev = busPos === 0 ? base : bus[busPos - 1];
    const shown = failed ? bus[busFail!] : prev;
    return (
      <div className={'screen' + (shaking ? ' shake' : '')}>
        <Phases phase={phase} />
        <div className="row between">
          <PlayerChip player={driver} selected extra={<span>🚌</span>} />
          <span className="pixel" style={{ fontSize: 9, color: 'var(--muted)' }}>
            Versuch {attempts}
          </span>
        </div>
        <div className="ga-card-stage" style={{ minHeight: 220 }}>
          <FlipCard card={shown} flipKey={`${flip}-${busPos}-${busFail}`} big />
        </div>
        <div className="ga-row-cards">
          {bus.map((c, i) => (
            <div key={i} className={i === busFail ? 'ga-slot-bad' : i < busPos ? 'ga-slot-ok' : i === busPos ? 'ga-slot-hl' : undefined}>
              <PlayingCard card={c} small hidden={i >= busPos && i !== busFail} />
            </div>
          ))}
        </div>
        <div className="ga-kicker">
          Haltestelle {Math.min(busPos + 1, 5)} von 5 {failed ? '' : `· Ist die nächste höher oder tiefer als ${short(prev)}?`}
        </div>
        {failed ? (
          <div className="ga-result bad">
            <div className="ga-big">ENDSTATION! ✘</div>
            <p>
              {cardName(bus[busFail!])} – {driver.name} kassiert <b>{sipsFor(busFail! + 1, driver)}</b> und fährt von vorne!
            </p>
            <div className="row center wrap">
              <LogSipsButton key={`bus-${attempts}`} player={driver} n={busFail! + 1} />
            </div>
            <Button color="yellow" big block onClick={retryBus}>
              🔄 Neue Karten, von vorne
            </Button>
          </div>
        ) : (
          <div className="ga-choices">
            <Button color="green" big onClick={() => guessBus(true)}>
              ▲ Höher
            </Button>
            <Button color="orange" big onClick={() => guessBus(false)}>
              ▼ Tiefer
            </Button>
          </div>
        )}
        <p className="muted small center">Gleich zählt als falsch. Bisher kassiert: {sipsFor(busSips, driver)}</p>
      </div>
    );
  }

  if (phase === 'won' && driver) {
    return (
      <div className="screen centered center">
        <Confetti fire={confetti} />
        <div className="avatar-big ga-pop" style={{ fontSize: 90 }}>
          🚌💨
        </div>
        <div className="ga-title xl">AUSGESTIEGEN!</div>
        <p style={{ fontSize: 26 }}>
          <span style={{ color: 'var(--yellow)' }}>
            {driver.avatar} {driver.name}
          </span>{' '}
          hat den Bus nach {attempts} {attempts === 1 ? 'Versuch' : 'Versuchen'} heil heimgebracht.
        </p>
        <p className="muted">Gesamt kassiert: {sipsFor(busSips, driver)}. Prost!</p>
        <div className="grid2" style={{ width: '100%' }}>
          <Button
            color="green"
            onClick={() => {
              addStat(driver.id, 'done', 1);
              sfx.coin();
              start();
            }}
          >
            Neue Runde
          </Button>
          <Button color="ghost" onClick={() => setPhase('intro')}>
            Menü
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen centered center">
      <Button color="yellow" onClick={() => setPhase('intro')}>
        Zurück zum Start
      </Button>
    </div>
  );
}
