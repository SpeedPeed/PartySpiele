import { useRef, useState, type CSSProperties } from 'react';
import { GAUDI_MIX } from '../data/gaudiMix';
import type { MixCard, MixType, Prompt } from '../data/types';
import { useDeck, useFill, usePrompts } from '../lib/hooks';
import { useStore, type Player } from '../lib/store';
import { between, pick } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import { Button, Confetti, PlayerChip, PromptCard, Rich, Seg } from '../components/ui';
import './mixSpiele.css';

const toMix = (p: Prompt): MixCard => ({ ...p, type: 'aufgabe' });

const TYPE_META: Record<MixType, { label: string; emoji: string; color: string }> = {
  aufgabe: { label: 'Aufgabe', emoji: '🎯', color: '#ff2e88' },
  regel: { label: 'Neue Regel', emoji: '📜', color: '#ffe03a' },
  virus: { label: 'Virus', emoji: '🦠', color: '#3dff6e' },
  gruppe: { label: 'Gruppe', emoji: '👯', color: '#19e3ff' },
  duell: { label: 'Duell', emoji: '⚔️', color: '#ff8a1f' },
  frage: { label: 'Frage', emoji: '❓', color: '#a64dff' },
};

const BONUS: { t: string; emoji: string }[] = [
  { t: 'BONUSRUNDE! Alle trinken {s:2}. Prost, ihr Hawara! 🍻', emoji: '🍻' },
  { t: 'Wasserpause 💧 Alle trinken ein Glas Wasser. Ja, {p} – du auch!', emoji: '💧' },
  { t: 'Wasserfall! {p} fängt an zu trinken, alle machen mit – aufhören darf man erst, wenn die Person vor einem aufhört.', emoji: '🌊' },
  { t: 'Gruppenfoto! Alle zusammenrücken, {p} drückt ab. Wer die Augen zu hat, nimmt {s:1}.', emoji: '📸' },
  { t: 'DJ-Runde: {p} darf das nächste Lied aussuchen. Wer meckert, nimmt {s:2}.', emoji: '🎧' },
  { t: 'Prost-Runde! Alle stoßen an und schauen sich dabei in die Augen. Wer wegschaut, nimmt {s:1}.', emoji: '🥂' },
  { t: 'Snack-Pause! 🥨 Alle essen was. {p} verteilt danach {s:3}.', emoji: '🥨' },
  { t: 'Jackpot! {p} darf {s:4} beliebig auf die Runde verteilen.', emoji: '🎰' },
  { t: 'Seitenwechsel! Alle rutschen einen Platz nach links. Wer als Letztes sitzt, nimmt {s:2}.', emoji: '🔄' },
];

interface ActiveRule {
  id: number;
  type: MixType;
  text: string;
  endText: string;
  until: number;
}

type Shown =
  | { kind: 'card'; card: MixCard; text: string; p: Player | null; p2: Player | null; penalty: number }
  | { kind: 'end'; rule: ActiveRule }
  | { kind: 'bonus'; text: string; emoji: string };

function penaltyOf(t: string): number {
  const m = /\{s:(\d+)\}/.exec(t);
  return m ? Number(m[1]) : 2;
}

export default function GaudiMix() {
  const items = usePrompts(GAUDI_MIX, 'gaudiMix', toMix);
  const draw = useDeck('gaudiMix', items);
  const fill = useFill();
  const { players, settings, addStat } = useStore();

  const [mode, setMode] = useState<'reihum' | 'zufall'>('reihum');
  const [started, setStarted] = useState(false);
  const [n, setN] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [rules, setRules] = useState<ActiveRule[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [logged, setLogged] = useState<null | { ok: boolean; msg: string }>(null);
  const [confetti, setConfetti] = useState(0);
  const [bonusAt, setBonusAt] = useState(() => between(13, 17));
  const turn = useRef(-1);
  const ruleId = useRef(0);

  const nextPlayer = (): Player | null => {
    if (!players.length) return null;
    if (mode === 'zufall' && players.length > 1) {
      let i = turn.current;
      while (i === turn.current) i = Math.floor(Math.random() * players.length);
      turn.current = i;
    } else turn.current = (turn.current + 1) % players.length;
    return players[turn.current];
  };

  const next = () => {
    const count = n + 1;
    setN(count);
    setLogged(null);

    // 1) Läuft eine Regel ab?
    const expired = rules.find((r) => r.until <= count);
    if (expired) {
      setRules((rs) => rs.filter((r) => r.id !== expired.id));
      setShown({ kind: 'end', rule: expired });
      sfx.whoosh();
      buzz([30, 40, 30]);
      return;
    }

    // 2) Bonusrunde?
    if (count >= bonusAt) {
      setBonusAt(count + between(13, 17));
      const b = pick(BONUS);
      const cur = nextPlayer();
      setShown({ kind: 'bonus', text: fill(b.t, cur).text, emoji: b.emoji });
      setConfetti((c) => c + 1);
      sfx.powerup();
      buzz([40, 30, 40, 30, 80]);
      return;
    }

    // 3) Normale Karte
    const card = draw();
    if (!card) {
      setShown(null);
      return;
    }
    const cur = nextPlayer();
    const f = fill(card.t, cur);
    if ((card.type === 'regel' || card.type === 'virus') && card.end) {
      const endText = fill(card.end, cur, { p: f.p, p2: f.p2, p3: f.p3 }).text;
      setRules((rs) => [...rs, { id: ++ruleId.current, type: card.type, text: f.text, endText, until: count + between(6, 12) }]);
      sfx.select();
    } else if (card.type === 'duell') {
      sfx.drumroll(0.6);
    } else sfx.card();
    setShown({ kind: 'card', card, text: f.text, p: f.p, p2: f.p2, penalty: penaltyOf(card.t) });
  };

  if (!started) {
    return (
      <div className="screen centered center">
        <div className="avatar-big pulse">🌀</div>
        <h1 style={{ color: 'var(--pink)', textShadow: '3px 3px 0 var(--shadow)' }}>GAUDI-MIX</h1>
        <p>Aufgaben, Regeln, Viren &amp; Duelle – vorlesen, machen, Prost!</p>
        <div className="row wrap center">
          {players.map((p) => (
            <PlayerChip key={p.id} player={p} />
          ))}
        </div>
        <h3>Wer ist dran?</h3>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'reihum', label: '🔁 Reihum' },
            { value: 'zufall', label: '🎲 Zufall' },
          ]}
        />
        <div style={{ height: 8 }} />
        <Button
          big
          block
          color="yellow"
          onClick={() => {
            sfx.fanfare();
            setStarted(true);
            next();
          }}
        >
          ▶ Press Start
        </Button>
      </div>
    );
  }

  const meta = shown?.kind === 'card' ? TYPE_META[shown.card.type] : null;
  const progress = Math.max(0, Math.min(100, (1 - (bonusAt - n) / 15) * 100));
  const isTask = shown?.kind === 'card' && shown.card.type === 'aufgabe' && shown.p;
  const isDuel = shown?.kind === 'card' && shown.card.type === 'duell' && shown.p && shown.p2;

  const logDone = (p: Player) => {
    addStat(p.id, 'done');
    sfx.success();
    setLogged({ ok: true, msg: `Leiwand, ${p.name}! ✔` });
  };
  const logRefused = (p: Player) => {
    addStat(p.id, 'refused');
    addStat(p.id, 'sips', 2);
    sfx.fail();
    buzz([80, 40, 80]);
    setLogged({ ok: false, msg: `Feigling! ${p.name} nimmt ${penaltyText(p, 2)}` });
  };
  const logDuel = (w: Player, l: Player, pen: number) => {
    addStat(w.id, 'wins');
    addStat(l.id, 'sips', pen);
    sfx.fanfare();
    setConfetti((c) => c + 1);
    setLogged({ ok: true, msg: `🏆 ${w.name} gewinnt – ${l.name} nimmt ${penaltyText(l, pen)}` });
  };
  function penaltyText(p: Player, k: number) {
    const drink = settings.drinkMode && !p.noAlcohol;
    return drink ? (k === 1 ? '1 Schluck' : `${k} Schlucke`) : k === 1 ? '1 Strafpunkt' : `${k} Strafpunkte`;
  }

  return (
    <div className="screen" style={{ paddingBottom: 0 }}>
      <Confetti fire={confetti} />
      <div className="row between small muted">
        <span className="pixel" style={{ fontSize: 9 }}>
          KARTE {n}
        </span>
        <span className="pixel" style={{ fontSize: 9, color: 'var(--yellow)' }}>
          BONUS IN {Math.max(0, bonusAt - n)}
        </span>
      </div>
      <div className="gx-progress">
        <div style={{ width: progress + '%' }} />
      </div>

      {!shown && <p className="center muted">Keine Karten für diese Stufen. Schau in die Regeln (?) und wähl mehr Stufen aus.</p>}

      {shown?.kind === 'card' && meta && (
        <PromptCard
            cardKey={n}
            kicker={
              <span>
                {meta.emoji} {meta.label}
              </span>
            }
            text={shown.text}
            level={shown.card.l}
            color={meta.color}
          />
      )}

      {shown?.kind === 'end' && (
        <div className="card gx-end-card" key={n} style={{ '--cc': '#7fffd4' } as CSSProperties}>
          <div className="card-kicker">{shown.rule.type === 'virus' ? '💉 Virus geheilt' : '🔓 Regel aufgehoben'}</div>
          <div className="card-emoji">{shown.rule.type === 'virus' ? '💉' : '🔓'}</div>
          <div className="card-text">
            <Rich text={shown.rule.endText} />
          </div>
          <div className="muted small" style={{ textDecoration: 'line-through' }}>
            <Rich text={shown.rule.text} />
          </div>
        </div>
      )}

      {shown?.kind === 'bonus' && (
        <div className="card gx-bonus-card" key={n} style={{ '--cc': '#ffe03a' } as CSSProperties}>
          <div className="card-kicker gx-blink">★ Bonusrunde ★</div>
          <div className="card-emoji">{shown.emoji}</div>
          <div className="card-text">
            <Rich text={shown.text} />
          </div>
        </div>
      )}

      {logged && <div className={'gx-stamp ' + (logged.ok ? 'ok' : 'bad')}>{logged.msg}</div>}

      {isTask && !logged && shown.p && (
        <div className="grid2">
          <Button color="green" onClick={() => logDone(shown.p!)} silent>
            Erledigt ✔
          </Button>
          <Button color="red" onClick={() => logRefused(shown.p!)} silent>
            Gekniffen ✘
          </Button>
        </div>
      )}

      {isDuel && !logged && shown.p && shown.p2 && (
        <div className="grid2">
          <Button color="orange" onClick={() => logDuel(shown.p!, shown.p2!, shown.penalty)} silent>
            {shown.p.avatar} {shown.p.name} gewinnt
          </Button>
          <Button color="cyan" onClick={() => logDuel(shown.p2!, shown.p!, shown.penalty)} silent>
            {shown.p2.avatar} {shown.p2.name} gewinnt
          </Button>
        </div>
      )}

      <Button color="yellow" block big onClick={next}>
        Weiter ▶
      </Button>

      <div className="spacer" />
      <div className="gx-rules">
        <button
          className="gx-rules-head"
          onClick={() => {
            sfx.click();
            setRulesOpen((o) => !o);
          }}
        >
          <span>📜 Aktive Regeln ({rules.length})</span>
          <span>{rulesOpen ? '▼' : '▲'}</span>
        </button>
        {rulesOpen && (
          <div className="gx-rules-body">
            {rules.length === 0 && <p className="muted small">Noch keine Regeln aktiv. Genießt die Anarchie!</p>}
            {rules.map((r) => (
              <div key={r.id} className="gx-rule" style={{ '--rc': TYPE_META[r.type].color } as CSSProperties}>
                {TYPE_META[r.type].emoji} <Rich text={r.text} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
