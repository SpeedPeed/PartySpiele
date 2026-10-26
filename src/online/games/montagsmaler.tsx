import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button, Panel } from '../../components/ui';
import { ACTIVITY_WORDS } from '../../data/activity';
import { shuffle } from '../../lib/random';
import { buzz, sfx } from '../../lib/sound';
import { BigTitle, Countdown, HostButton, MemberChip, Scoreboard, useSecondsLeft } from '../kit';
import type { Member, OnlineCtx, OnlineGameDef, OnlineViewProps, Stream } from '../types';
import { ChatInput, FinalScreen, OptionRow, SetupScreen, addScores, matches, useOnChange, useTickingSeconds } from './shared';

const DRAW_SECONDS = 80;
const CHOOSE_SECONDS = 15;
const HINTS = [40, 60];
const WORDS = ACTIVITY_WORDS.filter((w) => w.d <= 2).map((w) => w.w);

interface FeedItem {
  n: number;
  from: string;
  text: string;
  ok: boolean;
}

interface S {
  phase: 'setup' | 'choose' | 'draw' | 'reveal' | 'final';
  passes: number;
  drawn: Record<string, number>;
  turnNo: number;
  /** Zufällige ID pro Zeichen-Runde, damit alte Striche ignoriert werden. */
  turnId: string;
  drawer: string;
  choices: string[];
  word: string;
  deadline: number;
  hintOrder: number[];
  guessed: string[];
  feed: FeedItem[];
  feedSeq: number;
  gained: Record<string, number>;
  scores: Record<string, number>;
  used: string[];
  aborted: boolean;
}

type A = { type: 'start'; passes: number } | { type: 'choose'; i: number } | { type: 'guess'; text: string } | { type: 'next' } | { type: 'again' };

/* ------------------------------------------------------------------ reducer helpers */

function nextDrawer(s: S, ctx: OnlineCtx): string | null {
  const cands = ctx.players.filter((p) => (s.drawn[p.id] ?? 0) < s.passes);
  if (!cands.length) return null;
  const min = Math.min(...cands.map((p) => s.drawn[p.id] ?? 0));
  return cands.find((p) => (s.drawn[p.id] ?? 0) === min)!.id;
}

function nextTurn(s: S, ctx: OnlineCtx): S {
  const drawer = nextDrawer(s, ctx);
  if (!drawer) return { ...s, phase: 'final' };
  let pool = WORDS.filter((w) => !s.used.includes(w));
  let used = s.used;
  if (pool.length < 2) {
    pool = WORDS;
    used = [];
  }
  const choices = shuffle(pool).slice(0, 2);
  return {
    ...s,
    phase: 'choose',
    drawer,
    choices,
    used: [...used, ...choices],
    word: '',
    turnNo: s.turnNo + 1,
    turnId: Math.random().toString(36).slice(2, 10),
    drawn: { ...s.drawn, [drawer]: (s.drawn[drawer] ?? 0) + 1 },
    deadline: ctx.now + CHOOSE_SECONDS * 1000,
    hintOrder: [],
    guessed: [],
    feed: [],
    gained: {},
    aborted: false,
  };
}

function beginDraw(s: S, word: string, now: number): S {
  const letters: number[] = [];
  for (let i = 0; i < word.length; i++) if (/[\p{L}\p{N}]/u.test(word[i])) letters.push(i);
  return { ...s, phase: 'draw', word, deadline: now + DRAW_SECONDS * 1000, hintOrder: shuffle(letters) };
}

function endTurn(s: S, aborted = false): S {
  return { ...s, phase: 'reveal', aborted, scores: addScores(s.scores, s.gained) };
}

function guessers(s: S, players: Member[]): Member[] {
  return players.filter((p) => p.id !== s.drawer);
}

function allGuessed(s: S, ctx: OnlineCtx): boolean {
  return guessers(s, ctx.players).every((p) => s.guessed.includes(p.id));
}

function guessPoints(rank: number): number {
  return Math.max(100, 300 - rank * 50);
}

/* ------------------------------------------------------------------ canvas & stream */

interface Stroke {
  id: string;
  c: string;
  w: number;
  p: number[];
}
type StrokeMsg = Stroke & { k: string };

const RES = 360;
const COLORS = ['#0b0620', '#ff2e88', '#ff3b3b', '#ff8a1f', '#ffe03a', '#3dff6e', '#19e3ff', '#a64dff', '#8b4513'];
const SIZES = [0.01, 0.025, 0.055];
const ERASER = '#ffffff';

/** Striche bleiben pro Gerät erhalten, auch wenn die Komponente neu gemountet wird. */
const local: { key: string; strokes: Stroke[] } = { key: '', strokes: [] };
function strokesFor(key: string): Stroke[] {
  if (local.key !== key) {
    local.key = key;
    local.strokes = [];
  }
  return local.strokes;
}

function paint(ctx: CanvasRenderingContext2D, c: string, w: number, pts: number[], from?: [number, number]) {
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = Math.max(1, w * RES);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!from && pts.length === 2) {
    ctx.beginPath();
    ctx.arc(pts[0] * RES, pts[1] * RES, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  let i = 0;
  if (from) ctx.moveTo(from[0] * RES, from[1] * RES);
  else {
    ctx.moveTo(pts[0] * RES, pts[1] * RES);
    i = 2;
  }
  for (; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i] * RES, pts[i + 1] * RES);
  ctx.stroke();
}

function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, RES, RES);
  for (const s of strokes) if (s.p.length >= 2) paint(ctx, s.c, s.w, s.p);
}

const r3 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

function DrawCanvas({ stream, turnId, canDraw }: { stream: Stream; turnId: string; canDraw: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const drawing = useRef<Stroke | null>(null);
  const pending = useRef(new Map<string, Stroke>());
  const keyRef = useRef(turnId);
  keyRef.current = turnId;
  const ctx2d = () => ref.current?.getContext('2d') ?? null;

  const redraw = useCallback(() => {
    const ctx = ctx2d();
    if (ctx) redrawAll(ctx, strokesFor(keyRef.current));
  }, []);

  // initial / neuer Durchgang
  useEffect(() => {
    redraw();
  }, [turnId, redraw]);

  const flush = useCallback(() => {
    if (!pending.current.size) return;
    for (const st of pending.current.values()) stream.send('mm-stroke', { ...st, k: keyRef.current } satisfies StrokeMsg);
    pending.current.clear();
  }, [stream]);

  // Zeichner: alle 50 ms gebündelt senden + auf Sync-Anfragen antworten
  useEffect(() => {
    if (!canDraw) return;
    const iv = setInterval(flush, 50);
    const off = stream.on('mm-sync-req', (raw) => {
      const m = raw as { k?: string };
      if (m?.k !== keyRef.current) return;
      flush();
      const all = strokesFor(keyRef.current);
      // in Häppchen schicken, damit keine Nachricht zu groß wird
      let chunk: Stroke[] = [];
      let size = 0;
      let first = true;
      const send = () => {
        stream.send('mm-sync', { k: keyRef.current, strokes: chunk, reset: first });
        first = false;
        chunk = [];
        size = 0;
      };
      for (const st of all) {
        chunk.push(st);
        size += st.p.length;
        if (size > 4000) send();
      }
      if (chunk.length || first) send();
    });
    return () => {
      clearInterval(iv);
      off();
      flush();
    };
  }, [canDraw, stream, flush]);

  // Zuschauer: Striche empfangen
  useEffect(() => {
    if (canDraw) return;
    const offs = [
      stream.on('mm-stroke', (raw) => {
        const m = raw as StrokeMsg;
        if (!m || m.k !== keyRef.current || !Array.isArray(m.p) || !m.p.length) return;
        const list = strokesFor(m.k);
        const ctx = ctx2d();
        let st = list.find((x) => x.id === m.id);
        if (st) {
          const from: [number, number] = [st.p[st.p.length - 2], st.p[st.p.length - 1]];
          st.p.push(...m.p);
          if (ctx) paint(ctx, st.c, st.w, m.p, from);
        } else {
          st = { id: m.id, c: m.c, w: m.w, p: m.p.slice() };
          list.push(st);
          if (ctx) paint(ctx, st.c, st.w, st.p);
        }
      }),
      stream.on('mm-clear', (raw) => {
        const m = raw as { k?: string };
        if (m?.k !== keyRef.current) return;
        strokesFor(m.k).length = 0;
        redraw();
      }),
      stream.on('mm-sync', (raw) => {
        const m = raw as { k?: string; strokes?: Stroke[]; reset?: boolean };
        if (!m || m.k !== keyRef.current || !Array.isArray(m.strokes)) return;
        const list = strokesFor(m.k);
        if (m.reset) list.length = 0;
        for (const st of m.strokes) {
          const i = list.findIndex((x) => x.id === st.id);
          if (i >= 0) list[i] = { ...st, p: st.p.slice() };
          else list.push({ ...st, p: st.p.slice() });
        }
        redraw();
      }),
    ];
    // Wer neu reinkommt oder neu lädt: einmal das aktuelle Bild anfragen.
    if (!strokesFor(keyRef.current).length) stream.send('mm-sync-req', { k: keyRef.current });
    return () => offs.forEach((o) => o());
  }, [canDraw, stream, redraw, turnId]);

  const pos = (e: RPointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [r3((e.clientX - r.left) / r.width), r3((e.clientY - r.top) / r.height)];
  };

  const queue = (st: Stroke, pts: number[]) => {
    const q = pending.current.get(st.id);
    if (q) q.p.push(...pts);
    else pending.current.set(st.id, { id: st.id, c: st.c, w: st.w, p: pts.slice() });
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    const st: Stroke = { id: Math.random().toString(36).slice(2, 9), c: eraser ? ERASER : color, w: SIZES[size] * (eraser ? 2 : 1), p: [x, y] };
    strokesFor(keyRef.current).push(st);
    drawing.current = st;
    const ctx = ctx2d();
    if (ctx) paint(ctx, st.c, st.w, st.p);
    queue(st, [x, y]);
  };

  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const st = drawing.current;
    if (!canDraw || !st) return;
    const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const r = e.currentTarget.getBoundingClientRect();
    const raw = evs.length ? evs.map((ev) => [ev.clientX, ev.clientY]) : [[e.clientX, e.clientY]];
    const pts: number[] = [];
    let lx = st.p[st.p.length - 2];
    let ly = st.p[st.p.length - 1];
    const from: [number, number] = [lx, ly];
    for (const [cx, cy] of raw) {
      const x = r3((cx - r.left) / r.width);
      const y = r3((cy - r.top) / r.height);
      if (Math.abs(x - lx) + Math.abs(y - ly) < 0.004) continue;
      pts.push(x, y);
      lx = x;
      ly = y;
    }
    if (!pts.length) return;
    st.p.push(...pts);
    const ctx = ctx2d();
    if (ctx) paint(ctx, st.c, st.w, pts, from);
    queue(st, pts);
  };

  const onUp = () => {
    drawing.current = null;
  };

  const clear = () => {
    strokesFor(keyRef.current).length = 0;
    pending.current.clear();
    redraw();
    stream.send('mm-clear', { k: keyRef.current });
    sfx.whoosh();
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <canvas
        ref={ref}
        className="draw"
        width={RES}
        height={RES}
        style={{ imageRendering: 'pixelated', cursor: canDraw ? 'crosshair' : 'default' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      />
      {canDraw ? (
        <>
          <div className="row wrap" style={{ gap: 6, justifyContent: 'center' }}>
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={c}
                onClick={() => (sfx.click(), setColor(c), setEraser(false))}
                style={{ width: 34, height: 34, background: c, border: 'none', boxShadow: '0 0 0 3px var(--shadow)', outline: !eraser && color === c ? '3px solid var(--yellow)' : undefined, cursor: 'pointer' }}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
            {SIZES.map((sz, i) => (
              <button
                key={i}
                aria-label={'Stift ' + (i + 1)}
                className="iconbtn"
                onClick={() => (sfx.click(), setSize(i))}
                style={{ outline: size === i ? '3px solid var(--yellow)' : undefined }}
              >
                <span style={{ display: 'inline-block', width: 6 + sz * 300, height: 6 + sz * 300, maxWidth: 26, maxHeight: 26, background: eraser ? '#fff' : color, borderRadius: '50%' }} />
              </button>
            ))}
            <button className="iconbtn" aria-label="Radierer" onClick={() => (sfx.click(), setEraser((v) => !v))} style={{ outline: eraser ? '3px solid var(--yellow)' : undefined }}>
              🧽
            </button>
            <button className="iconbtn" aria-label="Alles löschen" onClick={clear}>
              🗑️
            </button>
          </div>
        </>
      ) : (
        <Button small color="ghost" onClick={() => stream.send('mm-sync-req', { k: keyRef.current })}>
          🔄 Bild neu laden
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ view */

function HintWord({ word, revealed }: { word: string; revealed: Set<number> }) {
  return (
    <div className="pixel center" style={{ fontSize: 16, letterSpacing: 4, color: 'var(--yellow)', lineHeight: 1.8, wordBreak: 'break-all' }}>
      {Array.from(word).map((ch, i) => (ch === ' ' ? '  ' : /[\p{L}\p{N}]/u.test(ch) && !revealed.has(i) ? '_' : ch)).join(' ')}
      <span className="muted" style={{ fontSize: 9, letterSpacing: 0 }}>
        {' '}
        ({word.replace(/[^\p{L}\p{N}]/gu, '').length})
      </span>
    </div>
  );
}

function Feed({ s, players }: { s: S; players: Member[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [s.feed.length]);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  if (!s.feed.length) return null;
  return (
    <div ref={box} className="panel" style={{ maxHeight: 150, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {s.feed.map((f) => (
        <div key={f.n} style={{ color: f.ok ? 'var(--green)' : 'var(--ink)', fontSize: 20 }}>
          {f.ok ? `✔ ${name(f.from)} hat’s!` : (
            <>
              <span className="muted">{name(f.from)}:</span> {f.text}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function View({ state: s, me, isHost, players, send, fill, stream }: OnlineViewProps<S, A>) {
  const [passes, setPasses] = useState(s.passes);
  const left = useSecondsLeft(s.phase === 'draw' ? s.deadline : null);
  useTickingSeconds(s.phase === 'draw' || s.phase === 'choose' ? s.deadline : null);
  const drawer = players.find((p) => p.id === s.drawer);
  const iDraw = s.drawer === me.id;
  const total = Math.max(s.turnNo, s.passes * players.length);

  useOnChange(String(s.guessed.length) + s.turnId, () => {
    if (s.guessed.length) {
      sfx.coin();
      if (s.guessed[s.guessed.length - 1] === me.id) buzz([40, 30, 40]);
    }
  });
  useOnChange(s.phase + s.turnId, () => {
    if (s.phase === 'reveal') (s.guessed.includes(me.id) || (iDraw && s.guessed.length) ? sfx.success : sfx.fail)();
    if (s.phase === 'choose' && iDraw) {
      sfx.powerup();
      buzz([60, 40, 60]);
    }
  });

  if (s.phase === 'setup')
    return (
      <SetupScreen
        isHost={isHost}
        emoji="🎨"
        title="Montagsmaler"
        players={players}
        intro={
          <>
            Reihum zeichnet einer am Handy, alle anderen raten per Texteingabe. Je schneller du’s hast, desto mehr Punkte – der Zeichner kriegt Punkte für jeden richtigen Rater. Nicht erraten: {fill('{s:1}')}!
          </>
        }
        onStart={() => send({ type: 'start', passes })}
      >
        <OptionRow
          label="Wie oft zeichnet jeder?"
          value={passes}
          onChange={setPasses}
          options={[
            { value: 1, label: '1×' },
            { value: 2, label: '2×' },
          ]}
        />
      </SetupScreen>
    );

  if (s.phase === 'final') return <FinalScreen players={players} scores={s.scores} me={me} isHost={isHost} fill={fill} onAgain={() => send({ type: 'again' })} title="Picasso des Abends" />;

  const header = (
    <div className="row between">
      <span className="pixel" style={{ fontSize: 9, color: 'var(--cyan)' }}>
        RUNDE {s.turnNo}/{total}
      </span>
      {drawer && <MemberChip m={drawer} extra={<span>✏️</span>} />}
    </div>
  );

  if (s.phase === 'choose')
    return (
      <div className="col">
        {header}
        <Countdown deadline={s.deadline} total={CHOOSE_SECONDS} />
        {iDraw ? (
          <>
            <BigTitle>Du zeichnest! ✏️</BigTitle>
            <p className="center">Such dir einen Begriff aus – psst, nicht verraten!</p>
            {s.choices.map((w, i) => (
              <Button key={w} color={i ? 'cyan' : 'pink'} block big onClick={() => send({ type: 'choose', i })}>
                {w}
              </Button>
            ))}
          </>
        ) : (
          <Panel className="center">
            <div className="avatar-big">{drawer?.avatar ?? '🎨'}</div>
            <p className="pulse">{drawer?.name ?? 'Der Zeichner'} sucht sich einen Begriff aus …</p>
          </Panel>
        )}
      </div>
    );

  if (s.phase === 'draw') {
    const elapsed = DRAW_SECONDS - left;
    const nHints = Math.min(HINTS.filter((h) => elapsed >= h).length, Math.max(0, s.hintOrder.length - 1));
    const revealed = new Set(s.hintOrder.slice(0, nHints));
    const iGot = s.guessed.includes(me.id);
    return (
      <div className="col" style={{ gap: 8 }}>
        {header}
        <Countdown deadline={s.deadline} total={DRAW_SECONDS} />
        {iDraw ? (
          <div className="center">
            <span className="muted small">Zeichne: </span>
            <span className="pixel" style={{ fontSize: 14, color: 'var(--yellow)' }}>
              {s.word}
            </span>
          </div>
        ) : iGot ? (
          <div className="ok-notice center">
            ✔ „{s.word}“ – du hast’s! Warte auf die anderen …
          </div>
        ) : (
          <HintWord word={s.word} revealed={revealed} />
        )}
        <DrawCanvas stream={stream} turnId={s.turnId} canDraw={iDraw} />
        {!iDraw && !iGot && <ChatInput placeholder="Dein Tipp …" onSubmit={(t) => send({ type: 'guess', text: t })} />}
        <Feed s={s} players={players} />
        <div className="small muted center">
          {s.guessed.length}/{Math.max(0, players.length - 1)} haben’s erraten
        </div>
      </div>
    );
  }

  // reveal
  const nobody = !s.guessed.length;
  const missed = players.filter((p) => p.id !== s.drawer && !s.guessed.includes(p.id));
  return (
    <div className="col">
      {header}
      <div className="center muted small">Der Begriff war</div>
      <BigTitle>{s.word || s.choices[0]}</BigTitle>
      {s.aborted && <div className="notice center">Der Zeichner ist abgehauen! 🏃 Runde abgebrochen.</div>}
      <DrawCanvas stream={stream} turnId={s.turnId} canDraw={false} />
      <Panel>
        {s.guessed.length > 0 ? (
          <div className="col" style={{ gap: 6 }}>
            {s.guessed.map((id, i) => {
              const m = players.find((p) => p.id === id);
              return (
                <div key={id} className="row between">
                  <span>
                    {i + 1}. {m ? m.avatar + ' ' + m.name : '👻'}
                  </span>
                  <span className="pixel" style={{ fontSize: 10, color: 'var(--cyan)' }}>
                    +{guessPoints(i)}
                  </span>
                </div>
              );
            })}
            {drawer && (
              <div className="row between" style={{ color: 'var(--yellow)' }}>
                <span>✏️ {drawer.name} (Zeichner)</span>
                <span className="pixel" style={{ fontSize: 10 }}>
                  +{s.gained[drawer.id] ?? 0}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="center">Keiner hat’s erraten! 🙈</p>
        )}
      </Panel>
      {!s.aborted && missed.length > 0 && (
        <div className="notice center">
          Nicht erraten: {missed.map((m) => m.name).join(', ')} – {fill('{s:1}')}!
        </div>
      )}
      {!s.aborted && nobody && drawer && (
        <div className="notice center">
          {drawer.name}, so a Gekritzel! {fill('{s:2}')} für den Zeichner 🎨🍺
        </div>
      )}
      <Scoreboard players={players} scores={s.scores} />
      <HostButton isHost={isHost} onClick={() => send({ type: 'next' })}>
        {nextDrawerPreview(s, players) ? 'Nächster Zeichner ▶' : '🏁 Zum Finale'}
      </HostButton>
    </div>
  );
}

function nextDrawerPreview(s: S, players: Member[]): boolean {
  return players.some((p) => (s.drawn[p.id] ?? 0) < s.passes);
}

export const montagsmaler: OnlineGameDef<S, A> = {
  id: 'montagsmaler',
  name: 'Montagsmaler',
  emoji: '🎨',
  tagline: 'Zeichnen am Handy, alle raten mit',
  color: '#3dff6e',
  minPlayers: 3,
  rules: [
    'Reihum zeichnet einer auf seinem Handy – die Zeichnung erscheint live bei allen.',
    'Der Zeichner wählt aus 2 Begriffen. 80 Sekunden Zeit, nach 40 und 60 Sekunden gibt’s Hinweis-Buchstaben.',
    'Alle anderen tippen ihre Tipps ein. Je früher du’s hast, desto mehr Punkte (300, 250, 200 …). Der Zeichner bekommt 100 pro richtigem Rater.',
    'Nicht erraten: 1 Schluck. Hat’s gar keiner: Zeichner trinkt 2.',
  ],
  init: () => ({
    phase: 'setup',
    passes: 1,
    drawn: {},
    turnNo: 0,
    turnId: '',
    drawer: '',
    choices: [],
    word: '',
    deadline: 0,
    hintOrder: [],
    guessed: [],
    feed: [],
    feedSeq: 0,
    gained: {},
    scores: {},
    used: [],
    aborted: false,
  }),
  reduce(s, a, ctx) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'setup') return s;
        return nextTurn({ ...s, passes: a.passes === 2 ? 2 : 1, drawn: {}, turnNo: 0, scores: {} }, ctx);
      }
      case 'choose': {
        if (s.phase !== 'choose' || a.from !== s.drawer) return s;
        const w = s.choices[a.i];
        return w ? beginDraw(s, w, ctx.now) : s;
      }
      case 'guess': {
        if (s.phase !== 'draw' || a.from === s.drawer || s.guessed.includes(a.from)) return s;
        const text = String(a.text ?? '').trim().slice(0, 40);
        if (!text) return s;
        const n = s.feedSeq + 1;
        if (matches(text, s.word)) {
          const rank = s.guessed.length;
          const gained = { ...s.gained, [a.from]: (s.gained[a.from] ?? 0) + guessPoints(rank), [s.drawer]: (s.gained[s.drawer] ?? 0) + 100 };
          const next: S = { ...s, guessed: [...s.guessed, a.from], gained, feedSeq: n, feed: [...s.feed, { n, from: a.from, text: '', ok: true }].slice(-40) };
          return allGuessed(next, ctx) ? endTurn(next) : next;
        }
        return { ...s, feedSeq: n, feed: [...s.feed, { n, from: a.from, text, ok: false }].slice(-40) };
      }
      case 'tick': {
        const drawerHere = ctx.players.some((p) => p.id === s.drawer);
        if (s.phase === 'choose') {
          if (!drawerHere) return endTurn({ ...s, word: s.choices[0] ?? '' }, true);
          if (ctx.now >= s.deadline) return beginDraw(s, s.choices[Math.floor(Math.random() * s.choices.length)], ctx.now);
        }
        if (s.phase === 'draw') {
          if (!drawerHere) return endTurn(s, true);
          if (ctx.now >= s.deadline || allGuessed(s, ctx)) return endTurn(s);
        }
        return s;
      }
      case 'next':
        if (s.phase !== 'reveal') return s;
        return nextTurn(s, ctx);
      case 'again':
        if (s.phase !== 'final') return s;
        return { ...s, phase: 'setup', drawn: {}, turnNo: 0, scores: {}, gained: {}, guessed: [], feed: [] };
    }
    return s;
  },
  View,
};
