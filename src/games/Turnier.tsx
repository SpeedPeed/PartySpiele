import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Confetti, Modal, Panel, PlayerPicker, Seg } from '../components/ui';
import { useStore, type Player } from '../lib/store';
import { pick, shuffle, uid } from '../lib/random';
import { buzz, sfx } from '../lib/sound';
import './Turnier.css';

/* ------------------------------------------------------------------ */
/* Datenmodell                                                          */
/* ------------------------------------------------------------------ */

type GameKind = 'bierpong' | 'flunky';
type Mode = 'ko' | 'rr';
type Tab = 'turnier' | 'bierpong' | 'flunky';

interface Team {
  id: string;
  name: string;
  members: string[]; // Spieler-IDs
}

interface Match {
  id: string;
  round: number; // 1-basiert
  slot: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  diff: number | null;
  bye: boolean;
}

interface TState {
  v: 1;
  phase: 'setup' | 'running' | 'done';
  game: GameKind;
  mode: Mode;
  teams: Team[];
  matches: Match[];
  counted: boolean;
}

const KEY = 'gaudi-turnier';
const EMPTY: TState = { v: 1, phase: 'setup', game: 'bierpong', mode: 'ko', teams: [], matches: [], counted: false };

function load(): TState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as TState;
      if (s && s.v === 1 && Array.isArray(s.teams) && Array.isArray(s.matches)) return { ...EMPTY, ...s };
    }
  } catch {
    /* kaputt – egal */
  }
  return EMPTY;
}

const TEAM_NAMES = [
  'Die Becherbezwinger',
  'Hopfenhelden',
  'Ping Pongos',
  'Schaumschläger',
  'Flunky Monkeys',
  'Die Promillos',
  'Spritzer-Gang',
  'Krügerl-Kommando',
  'Seidl-Squad',
  'Achterl-Armee',
  'Wiesn-Wikinger',
  'Die Pfiff-Piraten',
  'Bierathleten',
  'Team Kopfweh',
  'Die Zielwasser-Zwerge',
  'Dosen-Dynastie',
  'Die Stamperl-Ninjas',
  'Holladrio Hooligans',
  'Ballermänner',
  'Die Leberkäs-Legenden',
  'Becher-Bandidos',
  'Gösser Gang',
  'Die Radler-Rebellen',
  'Hackedicht Heroes',
];

function freshName(teams: Team[]): string {
  const used = new Set(teams.map((t) => t.name));
  const free = TEAM_NAMES.filter((n) => !used.has(n));
  return free.length ? pick(free) : `Team ${teams.length + 1}`;
}

/* ------------------------------------------------------------------ */
/* Turnier-Logik                                                        */
/* ------------------------------------------------------------------ */

function koRounds(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

function createKO(teams: Team[]): Match[] {
  const n = teams.length;
  const rounds = koRounds(n);
  const size = 2 ** rounds;
  const first = size / 2;
  const byes = size - n;
  const byeSlots = new Set<number>();
  for (let i = 0; i < byes; i++) byeSlots.add(Math.floor((i * first) / byes));
  const q = shuffle(teams.map((t) => t.id));
  const matches: Match[] = [];
  for (let s = 0; s < first; s++) {
    if (byeSlots.has(s)) {
      const a = q.shift()!;
      matches.push({ id: uid(), round: 1, slot: s, a, b: null, winner: a, diff: null, bye: true });
    } else {
      matches.push({ id: uid(), round: 1, slot: s, a: q.shift()!, b: q.shift()!, winner: null, diff: null, bye: false });
    }
  }
  for (let r = 2; r <= rounds; r++) {
    const cnt = size / 2 ** r;
    for (let s = 0; s < cnt; s++) matches.push({ id: uid(), round: r, slot: s, a: null, b: null, winner: null, diff: null, bye: false });
  }
  return deriveKO(matches);
}

/** Trägt Sieger in die Folgerunden ein; geänderte Paarungen verlieren ihr Ergebnis. */
function deriveKO(ms: Match[]): Match[] {
  const out = ms.map((m) => ({ ...m }));
  const get = (r: number, s: number) => out.find((m) => m.round === r && m.slot === s);
  const maxR = Math.max(...out.map((m) => m.round));
  for (let r = 2; r <= maxR; r++) {
    for (const m of out.filter((x) => x.round === r)) {
      const a = get(r - 1, m.slot * 2)?.winner ?? null;
      const b = get(r - 1, m.slot * 2 + 1)?.winner ?? null;
      if (a !== m.a || b !== m.b) {
        m.a = a;
        m.b = b;
        m.winner = null;
        m.diff = null;
      }
    }
  }
  return out;
}

function createRR(teams: Team[]): Match[] {
  const ids: (string | null)[] = shuffle(teams.map((t) => t.id));
  if (ids.length % 2) ids.push(null);
  const n = ids.length;
  const matches: Match[] = [];
  let arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    let slot = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) matches.push({ id: uid(), round: r + 1, slot: slot++, a: r % 2 ? b : a, b: r % 2 ? a : b, winner: null, diff: null, bye: false });
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return matches;
}

interface Row {
  team: Team;
  played: number;
  wins: number;
  losses: number;
  diff: number;
}

function standings(teams: Team[], matches: Match[]): Row[] {
  const rows = new Map<string, Row>(teams.map((t) => [t.id, { team: t, played: 0, wins: 0, losses: 0, diff: 0 }]));
  for (const m of matches) {
    if (!m.winner || !m.a || !m.b) continue;
    const loser = m.winner === m.a ? m.b : m.a;
    const w = rows.get(m.winner);
    const l = rows.get(loser);
    if (w) {
      w.played++;
      w.wins++;
      w.diff += m.diff ?? 0;
    }
    if (l) {
      l.played++;
      l.losses++;
      l.diff -= m.diff ?? 0;
    }
  }
  const direct = (x: string, y: string) => {
    const m = matches.find((mm) => mm.winner && ((mm.a === x && mm.b === y) || (mm.a === y && mm.b === x)));
    return m ? (m.winner === x ? -1 : 1) : 0;
  };
  return [...rows.values()].sort((a, b) => b.wins - a.wins || b.diff - a.diff || direct(a.team.id, b.team.id));
}

function roundName(r: number, total: number): string {
  const left = total - r;
  if (left === 0) return 'Finale';
  if (left === 1) return 'Halbfinale';
  if (left === 2) return 'Viertelfinale';
  if (left === 3) return 'Achtelfinale';
  return `Runde ${r}`;
}

function championOf(s: TState): string | null {
  if (!s.matches.length) return null;
  if (s.mode === 'ko') {
    const maxR = Math.max(...s.matches.map((m) => m.round));
    return s.matches.find((m) => m.round === maxR)?.winner ?? null;
  }
  if (s.matches.some((m) => !m.winner)) return null;
  return standings(s.teams, s.matches)[0]?.team.id ?? null;
}

function playable(m: Match) {
  return !m.bye && !!m.a && !!m.b;
}

/* ------------------------------------------------------------------ */
/* Komponente                                                           */
/* ------------------------------------------------------------------ */

export default function Turnier() {
  const { players, addStat } = useStore();
  const [tab, setTab] = useState<Tab>('turnier');
  const [st, setSt] = useState<TState>(load);
  const [newName, setNewName] = useState('');
  const [assign, setAssign] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [selWinner, setSelWinner] = useState<string | null>(null);
  const [selDiff, setSelDiff] = useState<number>(0);
  const [champ, setChamp] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* voll */
    }
  }, [st]);

  // Konfetti-Dauerfeuer am Sieger-Screen
  useEffect(() => {
    if (!champ) return;
    setConfetti((c) => c + 1);
    const iv = window.setInterval(() => setConfetti((c) => c + 1), 1800);
    return () => window.clearInterval(iv);
  }, [champ]);

  const team = (id: string | null) => st.teams.find((t) => t.id === id);
  const pById = (id: string) => players.find((p) => p.id === id);
  const memberNames = (t: Team) =>
    t.members
      .map(pById)
      .filter((p): p is Player => !!p)
      .map((p) => `${p.avatar} ${p.name}`);

  const champion = championOf(st);
  const totalRounds = st.matches.length ? Math.max(...st.matches.map((m) => m.round)) : 0;
  const nextMatch = st.matches
    .filter((m) => playable(m) && !m.winner)
    .sort((a, b) => a.round - b.round || a.slot - b.slot)[0];
  const openMatch = st.matches.find((m) => m.id === open) ?? null;
  const decided = st.matches.filter((m) => !m.bye && m.winner).length;
  const totalPlayable = st.matches.filter((m) => !m.bye).length;

  /* ---------- Setup-Aktionen ---------- */

  const addTeam = (name?: string) => {
    const nm = (name ?? newName).trim() || freshName(st.teams);
    setSt((s) => ({ ...s, teams: [...s.teams, { id: uid(), name: nm, members: [] }] }));
    setNewName('');
    sfx.coin();
    buzz(20);
  };

  const drawTeams = () => {
    if (players.length < 2) return;
    const sh = shuffle(players);
    const groups: Player[][] = [];
    for (let i = 0; i + 1 < sh.length; i += 2) groups.push([sh[i], sh[i + 1]]);
    if (sh.length % 2) {
      if (groups.length) groups[groups.length - 1].push(sh[sh.length - 1]);
      else groups.push([sh[sh.length - 1]]);
    }
    const names = shuffle(TEAM_NAMES);
    setSt((s) => ({ ...s, teams: groups.map((g, i) => ({ id: uid(), name: names[i] ?? `Team ${i + 1}`, members: g.map((p) => p.id) })) }));
    sfx.drumroll(0.6);
    window.setTimeout(() => sfx.success(), 600);
    buzz([20, 30, 20, 30, 60]);
  };

  const toggleMember = (teamId: string, pid: string) => {
    setSt((s) => ({
      ...s,
      teams: s.teams.map((t) => {
        if (t.id === teamId) return { ...t, members: t.members.includes(pid) ? t.members.filter((x) => x !== pid) : [...t.members, pid] };
        return { ...t, members: t.members.filter((x) => x !== pid) };
      }),
    }));
  };

  const start = () => {
    if (st.teams.length < 2) return;
    const matches = st.mode === 'ko' ? createKO(st.teams) : createRR(st.teams);
    setSt((s) => ({ ...s, phase: 'running', matches, counted: false }));
    sfx.powerup();
    buzz([40, 30, 80]);
  };

  const resetAll = (keepTeams: boolean) => {
    setSt((s) => ({ ...EMPTY, game: s.game, mode: s.mode, teams: keepTeams ? s.teams : [] }));
    setChamp(false);
    setConfirmReset(false);
    sfx.whoosh();
  };

  /* ---------- Ergebnis eintragen ---------- */

  const openResult = (m: Match) => {
    if (!playable(m)) return;
    setOpen(m.id);
    setSelWinner(m.winner);
    setSelDiff(m.diff ?? 0);
    sfx.select();
  };

  const saveResult = () => {
    if (!openMatch || !selWinner) return;
    const updated = st.matches.map((m) => (m.id === openMatch.id ? { ...m, winner: selWinner, diff: selDiff || null } : m));
    const matches = st.mode === 'ko' ? deriveKO(updated) : updated;
    const next: TState = { ...st, matches };
    const ch = championOf(next);
    if (ch) {
      next.phase = 'done';
      if (!next.counted) {
        team(ch)?.members.forEach((pid) => addStat(pid, 'wins', 1));
        next.counted = true;
      }
      setChamp(true);
      sfx.drumroll(1.2);
      window.setTimeout(() => sfx.fanfare(), 1200);
      buzz([100, 60, 100, 60, 400]);
    } else {
      next.phase = 'running';
      sfx.success();
      buzz([40, 30, 60]);
    }
    setSt(next);
    setOpen(null);
  };

  /* ---------- Render-Helfer ---------- */

  const teamLine = (id: string | null, m: Match, side: 'a' | 'b') => {
    const t = team(id);
    if (m.bye && side === 'b')
      return (
        <div className="tn-team tbd">
          <span className="nm">🎟️ Freilos</span>
        </div>
      );
    if (!t)
      return (
        <div className="tn-team tbd">
          <span className="nm">???</span>
        </div>
      );
    const cls = m.winner ? (m.winner === t.id ? 'win' : 'lose') : '';
    return (
      <div className={'tn-team ' + cls}>
        <span className="nm">{t.name}</span>
        {m.winner === t.id && !m.bye && m.diff ? <span className="d">+{m.diff}</span> : null}
        {m.winner === t.id && <span>✓</span>}
      </div>
    );
  };

  const matchBox = (m: Match) => (
    <button key={m.id} className={'tn-match' + (nextMatch?.id === m.id ? ' next' : '')} disabled={!playable(m)} onClick={() => openResult(m)}>
      {teamLine(m.a, m, 'a')}
      {teamLine(m.b, m, 'b')}
    </button>
  );

  const rows = useMemo(() => (st.mode === 'rr' ? standings(st.teams, st.matches) : []), [st.mode, st.teams, st.matches]);
  const diffLabel = st.game === 'bierpong' ? 'Becher-Differenz (Restbecher des Siegers)' : 'Differenz (z. B. übrige Biere des Verlierers)';

  /* ---------- Tabs ---------- */

  const tabs = (
    <Seg<Tab>
      value={tab}
      onChange={setTab}
      color="var(--orange)"
      options={[
        { value: 'turnier', label: '🏆 Turnier' },
        { value: 'bierpong', label: '🏓 Regeln Bierpong' },
        { value: 'flunky', label: '🍺 Regeln Flunkyball' },
      ]}
    />
  );

  if (tab === 'bierpong')
    return (
      <div className="screen">
        {tabs}
        <BierpongRules />
      </div>
    );
  if (tab === 'flunky')
    return (
      <div className="screen">
        {tabs}
        <FlunkyRules />
      </div>
    );

  /* ---------- Setup ---------- */

  if (st.phase === 'setup') {
    const n = st.teams.length;
    const size = n >= 2 ? 2 ** koRounds(n) : 0;
    const byes = size - n;
    const assignTeam = st.teams.find((t) => t.id === assign);
    return (
      <div className="screen">
        {tabs}
        <Panel>
          <h3 style={{ marginTop: 0 }}>Disziplin</h3>
          <Seg<GameKind>
            value={st.game}
            onChange={(g) => setSt((s) => ({ ...s, game: g }))}
            options={[
              { value: 'bierpong', label: '🏓 Bierpong' },
              { value: 'flunky', label: '🍺 Flunkyball' },
            ]}
          />
          <h3>Modus</h3>
          <Seg<Mode>
            value={st.mode}
            color="var(--pink)"
            onChange={(m) => setSt((s) => ({ ...s, mode: m }))}
            options={[
              { value: 'ko', label: '⚔️ K.-o.-System' },
              { value: 'rr', label: '🔄 Jeder gegen jeden' },
            ]}
          />
        </Panel>

        <h2>Teams ({n})</h2>
        {players.length >= 2 && (
          <Button color="purple" block onClick={drawTeams}>
            🎲 Teams aus Spielern auslosen (2er)
          </Button>
        )}
        <div className="list">
          {st.teams.map((t, i) => (
            <div className="list-item tn-pop" key={t.id} style={{ alignItems: 'flex-start' }}>
              <span className="pixel" style={{ fontSize: 10, color: 'var(--yellow)', paddingTop: 12 }}>
                {i + 1}
              </span>
              <div className="grow col" style={{ gap: 4 }}>
                <input
                  className="input"
                  style={{ fontSize: 22, padding: 8 }}
                  value={t.name}
                  onChange={(e) => setSt((s) => ({ ...s, teams: s.teams.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) }))}
                />
                <div className="muted small">{memberNames(t).join(' · ') || 'keine Spieler zugeordnet'}</div>
              </div>
              {players.length > 0 && (
                <button className="iconbtn" aria-label="Spieler zuordnen" onClick={() => setAssign(t.id)}>
                  👥
                </button>
              )}
              <button className="iconbtn" aria-label="Team löschen" onClick={() => setSt((s) => ({ ...s, teams: s.teams.filter((x) => x.id !== t.id) }))}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="row">
          <input
            className="input"
            placeholder="Teamname (leer = Zufallsname)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTeam()}
          />
          <Button small color="green" onClick={() => addTeam()}>
            ＋
          </Button>
        </div>

        {n >= 2 && (
          <p className="muted small center">
            {st.mode === 'ko'
              ? `${n} Teams → ${koRounds(n)} Runden, ${n - 1} Spiele${byes ? `, ${byes} Freilos${byes > 1 ? 'e' : ''}` : ''}.`
              : `${n} Teams → ${(n * (n - 1)) / 2} Spiele, ${n % 2 ? n : n - 1} Spieltage.`}
          </p>
        )}
        <Button color="yellow" big block disabled={n < 2} onClick={start}>
          {n < 2 ? 'Mind. 2 Teams anlegen' : '▶ Turnier starten'}
        </Button>

        <Modal open={!!assignTeam} onClose={() => setAssign(null)} title={assignTeam ? `Spieler für ${assignTeam.name}` : ''}>
          {assignTeam && (
            <>
              <p className="muted small">Antippen zum Zuordnen. Jede Person kann nur in einem Team sein.</p>
              <PlayerPicker selected={assignTeam.members} onToggle={(pid) => toggleMember(assignTeam.id, pid)} />
              <div style={{ height: 12 }} />
              <Button block color="green" onClick={() => setAssign(null)}>
                Passt!
              </Button>
            </>
          )}
        </Modal>
      </div>
    );
  }

  /* ---------- Läuft / Fertig ---------- */

  const champTeam = team(champion);
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className="screen">
      <Confetti fire={confetti} />
      {tabs}
      <div className="row between">
        <div>
          <div className="pixel" style={{ fontSize: 10, color: 'var(--orange)' }}>
            {st.game === 'bierpong' ? '🏓 BIERPONG' : '🍺 FLUNKYBALL'} · {st.mode === 'ko' ? 'K.-O.' : 'LIGA'}
          </div>
          <div className="muted small">
            {decided}/{totalPlayable} Spiele gespielt
          </div>
        </div>
        <Button small color={confirmReset ? 'red' : 'ghost'} onClick={() => (confirmReset ? resetAll(true) : setConfirmReset(true))}>
          {confirmReset ? 'Sicher? Neu!' : '↺ Neu'}
        </Button>
      </div>

      {st.phase === 'done' && champTeam ? (
        <Panel glow="yellow" className="center">
          <div style={{ fontSize: 40 }}>🏆</div>
          <div className="pixel" style={{ fontSize: 12, color: 'var(--yellow)' }}>
            {champTeam.name}
          </div>
          <Button color="yellow" onClick={() => setChamp(true)}>
            Siegerehrung ansehen
          </Button>
        </Panel>
      ) : (
        nextMatch && (
          <Panel glow="cyan" className="center">
            <div className="muted small">
              Als Nächstes{st.mode === 'ko' ? ` · ${roundName(nextMatch.round, totalRounds)}` : ` · Spieltag ${nextMatch.round}`}
            </div>
            <div className="row center wrap" style={{ margin: '6px 0' }}>
              <b style={{ fontSize: 24 }}>{team(nextMatch.a)?.name}</b>
              <span className="tn-vs">VS</span>
              <b style={{ fontSize: 24 }}>{team(nextMatch.b)?.name}</b>
            </div>
            <Button color="cyan" onClick={() => openResult(nextMatch)}>
              Ergebnis eintragen
            </Button>
          </Panel>
        )
      )}

      {st.mode === 'ko' ? (
        <>
          <p className="muted small center">← Turnierbaum wischen · Spiel antippen = Sieger eintragen →</p>
          <div className="tn-bracket">
            {rounds.map((r) => (
              <div className="tn-col" key={r}>
                <div className="tn-col-head">{roundName(r, totalRounds)}</div>
                <div className="tn-col-body">
                  {st.matches
                    .filter((m) => m.round === r)
                    .sort((a, b) => a.slot - b.slot)
                    .map(matchBox)}
                </div>
              </div>
            ))}
            <div className="tn-col" style={{ flexBasis: 150 }}>
              <div className="tn-col-head">Champion</div>
              <div className="tn-col-body center">
                <div style={{ fontSize: 50 }}>{champTeam ? '🏆' : '❔'}</div>
                <div className="pixel" style={{ fontSize: 10, color: 'var(--yellow)', lineHeight: 1.6 }}>
                  {champTeam?.name ?? '…'}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <Panel>
            <table className="tn-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ textAlign: 'left' }}>Team</th>
                  <th>Sp</th>
                  <th>S</th>
                  <th>N</th>
                  <th>±</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.team.id} className={i === 0 && r.wins > 0 ? 'top' : ''}>
                    <td>{i === 0 && r.wins > 0 ? '👑' : i + 1}</td>
                    <td className="l">{r.team.name}</td>
                    <td>{r.played}</td>
                    <td>
                      <b>{r.wins}</b>
                    </td>
                    <td>{r.losses}</td>
                    <td>{r.diff > 0 ? '+' + r.diff : r.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Sortiert nach Siegen, dann {st.game === 'bierpong' ? 'Becher' : 'Differenz'}, dann direktem Duell.</p>
          </Panel>
          {rounds.map((r) => (
            <div key={r}>
              <h3>Spieltag {r}</h3>
              <div className="grid2">
                {st.matches
                  .filter((m) => m.round === r)
                  .map(matchBox)}
              </div>
              {st.teams.length % 2 === 1 && (
                <p className="muted small">
                  Spielfrei: {st.teams.filter((t) => !st.matches.some((m) => m.round === r && (m.a === t.id || m.b === t.id))).map((t) => t.name).join(', ')} 🍻
                </p>
              )}
            </div>
          ))}
        </>
      )}

      {/* Ergebnis-Dialog */}
      <Modal open={!!openMatch} onClose={() => setOpen(null)} title="Wer hat gewonnen?">
        {openMatch && (
          <>
            {st.mode === 'ko' && openMatch.winner && st.matches.some((m) => m.round === openMatch.round + 1 && m.winner && (m.a === openMatch.winner || m.b === openMatch.winner)) && (
              <p className="notice small">Achtung: Folgespiele dieses Teams werden beim Ändern zurückgesetzt.</p>
            )}
            <div className="col">
              {[openMatch.a, openMatch.b].map((id) => {
                const t = team(id);
                if (!t) return null;
                return (
                  <Button key={t.id} block big color={selWinner === t.id ? 'green' : 'ghost'} onClick={() => setSelWinner(t.id)}>
                    {selWinner === t.id ? '🏆 ' : ''}
                    {t.name}
                  </Button>
                );
              })}
            </div>
            <h3>{diffLabel} – optional</h3>
            <Seg<number>
              value={selDiff}
              onChange={setSelDiff}
              color="var(--yellow)"
              options={[{ value: 0, label: '–' }, ...Array.from({ length: st.game === 'bierpong' ? 10 : 6 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))]}
            />
            <div style={{ height: 12 }} />
            <Button block big color="yellow" disabled={!selWinner} onClick={saveResult}>
              ✓ Eintragen
            </Button>
          </>
        )}
      </Modal>

      {/* Siegerehrung */}
      {champ && champTeam && (
        <div className="tn-champ" onClick={() => setChamp(false)}>
          <div className="tn-rays" />
          <div className="pixel" style={{ fontSize: 12, color: 'var(--cyan)' }}>
            {st.game === 'bierpong' ? 'BIERPONG' : 'FLUNKYBALL'}-CHAMPION
          </div>
          <div className="tn-trophy">🏆</div>
          <div className="tn-champ-name">{champTeam.name}</div>
          {memberNames(champTeam).length > 0 && <div style={{ fontSize: 26 }}>{memberNames(champTeam).join(' & ')}</div>}
          <p className="muted">Leiwand! Ewiger Ruhm und die nächste Runde geht auf die Verlierer. Prost!</p>
          <div className="row wrap center" onClick={(e) => e.stopPropagation()}>
            <Button color="ghost" onClick={() => setChamp(false)}>
              Turnierbaum
            </Button>
            <Button color="yellow" onClick={() => resetAll(true)}>
              Revanche (gleiche Teams)
            </Button>
            <Button color="pink" onClick={() => resetAll(false)}>
              Neues Turnier
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Regeln                                                               */
/* ------------------------------------------------------------------ */

function Rule({ tag, children }: { tag?: string; children: ReactNode }) {
  return (
    <li>
      {tag && <span className="tag">{tag}</span>}
      {children}
    </li>
  );
}

function Cups() {
  return (
    <div className="tn-cups" aria-label="10 Becher im Dreieck">
      {[4, 3, 2, 1].map((n) => (
        <div key={n}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}

function WaterNote() {
  const { settings } = useStore();
  return (
    <div className="ok-notice small">
      💧 <b>Variante mit Wasser:</b> Die Spielbecher werden nur mit Wasser gefüllt – getroffen heißt dann „einen Schluck aus dem eigenen Glas“ (Bier, Spritzer, Saft – egal). Hygienischer (der Ball war am Boden, glaub’s uns), billiger und man ist nach dem Halbfinale noch zurechnungsfähig.
      {!settings.drinkMode && ' Im alkoholfreien Modus zählen Treffer einfach als Strafpunkte.'}
    </div>
  );
}

function BierpongRules() {
  return (
    <div className="tn-rules">
      <Panel glow="pink">
        <h2 style={{ marginTop: 0 }}>🏓 Bierpong – Die Gaudi-Regeln</h2>
        <p className="muted small">Offiziell, weil’s in einer App steht. Hausregeln schlagen App-Regeln – aber nur, wenn sie VOR dem Spiel ausgemacht werden.</p>

        <h3>Aufbau</h3>
        <Cups />
        <ul>
          <Rule>Langer Tisch (ideal 2,40 m). An jedem Ende <b>10 Becher als Dreieck</b> (4-3-2-1), Spitze zeigt zum Gegner, Becher berühren sich.</Rule>
          <Rule>Becher ca. ein Viertel füllen. Dazu pro Team ein Wasserbecher zum Ball-Waschen – kein Mensch will den Boden-Geschmack.</Rule>
          <Rule>2 gegen 2 (1 gegen 1 geht auch – dann wirft man beide Bälle selbst).</Rule>
        </ul>

        <h3>Wer fängt an?</h3>
        <ul>
          <Rule>
            <b>Augen-Duell:</b> Je eine Person pro Team wirft gleichzeitig und schaut dabei dem Gegenüber tief in die Augen. Wer trifft, beginnt. Wer wegschaut, verliert sofort jeglichen Respekt.
          </Rule>
        </ul>

        <h3>Ablauf</h3>
        <ul>
          <Rule>Pro Zug wirft jede Person im Team einen Ball. Dann ist das andere Team dran.</Rule>
          <Rule>Ball landet im Becher → das <b>gegnerische</b> Team trinkt diesen Becher aus und stellt ihn weg.</Rule>
          <Rule tag="ELLBOGEN">Beim Wurf darf der Ellbogen <b>nicht über die Tischkante</b> ragen. Erwischt? Treffer zählt nicht, Becher bleibt. Die Gegner dürfen das lautstark reklamieren – und tun’s auch.</Rule>
          <Rule tag="BOUNCE">Aufgetippte Bälle (Bounce) sind erlaubt und <b>zählen doppelt</b>: der getroffene Becher plus einer nach Wahl der Werfer. Aber: Sobald der Ball den Tisch berührt hat, dürfen die Verteidiger ihn wegschlagen.</Rule>
          <Rule tag="FINGER WEG">Normale Würfe (ohne Bounce) darf man nicht abwehren. Wer’s trotzdem tut: Becher nach Wahl der Werfer weg.</Rule>
          <Rule tag="BALLS BACK">Treffen <b>beide</b> Personen eines Teams im selben Zug, gibt’s die Bälle zurück – <b>Nachwurf</b>! Gleich nochmal werfen.</Rule>
          <Rule tag="BOMBE">Beide Bälle im <b>selben</b> Becher = 3 Becher weg (der Becher plus zwei nach Wahl). Ehrfürchtiges Schweigen angebracht.</Rule>
          <Rule tag="RE-RACK">
            <b>Umstellen:</b> Jedes Team darf <b>2× pro Spiel</b> zu Beginn des eigenen Zuges verlangen, dass die Ziel-Becher neu formiert werden (z. B. Dreieck bei 6 oder 3 Bechern, Raute bei 4, Linie bei 2). Becher müssen sich berühren.
          </Rule>
          <Rule tag="INSEL">
            <b>Inselregel:</b> Steht ein Becher allein (berührt keinen anderen), darf man einmal pro Spiel „Insel!“ ansagen. Trifft man genau diesen → er und ein zweiter Becher nach Wahl sind weg. Daneben angesagt? Pech, Ansage verbraucht.
          </Rule>
          <Rule tag="ON FIRE">Optional: Wer 2× hintereinander trifft, ruft „heating up“. Trifft er zum dritten Mal, ist er <b>on fire</b> und wirft so lange weiter, bis er daneben wirft.</Rule>
          <Rule tag="ZURÜCK">Rollt ein Ball auf die eigene Seite zurück und wird gefangen, gibt’s einen Trickshot-Bonuswurf (hinter dem Rücken, mit links, mit Stil).</Rule>
        </ul>

        <h3>Spielende</h3>
        <ul>
          <Rule tag="REBUTTAL">
            Fällt der letzte Becher, ist das Spiel noch <b>nicht</b> vorbei: Das unterlegene Team bekommt den <b>Rebuttal</b>. Jede Person wirft so lange, bis sie einmal daneben wirft. Werden so alle restlichen Becher versenkt → <b>Overtime</b> mit je 3 Bechern im Dreieck. Sonst: GG, ab zum Händeschütteln.
          </Rule>
          <Rule>Die Sieger-Becher, die noch stehen, trinken die Verlierer (oder, Variante „Gnade“, alle gemeinsam). Diese <b>Restbecher</b> trägst du in der App als Becher-Differenz ein.</Rule>
        </ul>
        <WaterNote />
      </Panel>
    </div>
  );
}

function FlunkyRules() {
  return (
    <div className="tn-rules">
      <Panel glow="yellow">
        <h2 style={{ marginTop: 0 }}>🍺 Flunkyball – Die Gaudi-Regeln</h2>
        <p className="muted small">Der Wiesen-Sport für Leute, die Sport eigentlich nicht mögen. Laufen UND trinken – Multitasking für Fortgeschrittene.</p>

        <h3>Aufbau</h3>
        <ul>
          <Rule>Zwei Teams (je 3–6 Leute) stellen sich in zwei Linien gegenüber, ca. <b>6–10 m</b> Abstand. Linien mit Schuhen, Jacken oder dem Schlapfen von Onkel Gerhard markieren.</Rule>
          <Rule>
            Genau <b>in der Mitte</b> steht eine <b>Flasche</b> (leere PET-Flasche mit etwas Wasser oder Sand, damit sie nicht schon beim Anschauen umfällt).
          </Rule>
          <Rule>Jede Person hat ein volles Bier (Dose/Flasche, gleiche Größe für alle!) vor sich auf der Linie stehen. Dazu ein Ball (Softball, Tennisball, notfalls ein zusammengeknüllter Pulli).</Rule>
        </ul>

        <h3>Wurf</h3>
        <ul>
          <Rule>Die Teams werfen abwechselnd, innerhalb des Teams reihum. Geworfen wird von der eigenen Linie aus – <b>Übertreten</b> beim Wurf = Wurf ungültig.</Rule>
          <Rule>Ziel: die Flasche in der Mitte <b>umwerfen</b>.</Rule>
        </ul>

        <h3>Treffer! – Laufen & Trinken</h3>
        <ul>
          <Rule tag="TRINKEN">Fällt die Flasche, dürfen <b>alle im Werferteam</b> sofort ihr Bier nehmen und trinken.</Rule>
          <Rule tag="LAUFEN">
            Das gegnerische Team muss rennen: <b>Ball holen, Flasche wieder aufstellen</b> und alle zurück hinter die eigene Linie. Dann laut <b>„STOPP!“</b> rufen.
          </Rule>
          <Rule tag="STOPP">Beim „Stopp“ müssen alle Werfer ihr Bier sofort wieder abstellen. Getrunken wird <b>nur bis zur Rückkehr</b> der Läufer.</Rule>
          <Rule>Daneben geworfen? Dann holt das Werferteam selbst den Ball zurück – ohne Trinken, ohne Gnade, mit Schande.</Rule>
        </ul>

        <h3>Strafbiere 🍻</h3>
        <ul>
          <Rule>Trinken außerhalb der eigenen Trinkphase.</Rule>
          <Rule>Bier umgestoßen oder ausgeschüttet (auch durch den gegnerischen Ball – das Leben ist unfair).</Rule>
          <Rule>Zu früh losgelaufen, Linie beim Wurf übertreten, Flasche absichtlich schief aufgestellt.</Rule>
          <Rule>Ein Strafbier ist ein <b>zusätzliches</b> Getränk, das die Person nach ihrem eigentlichen Bier ebenfalls leeren muss (alkoholfrei: Strafpunkte, Wasser oder Liegestütze).</Rule>
        </ul>

        <h3>Spielende & Exen</h3>
        <ul>
          <Rule tag="ABNAHME">Wer meint, leer zu sein, hält die Dose über den Kopf und dreht sie um. Das Gegnerteam „nimmt ab“: Mehr als ein Tropfen? Weitertrinken + Strafbier.</Rule>
          <Rule tag="EXEN">Leer werden darf man nur während einer eigenen Trinkphase – der letzte Rest wird also beim finalen Treffer <b>auf Ex</b> vernichtet, bevor das „Stopp“ kommt.</Rule>
          <Rule>Gewonnen hat das Team, bei dem <b>alle</b> (inkl. Strafbiere) leer sind. Fertige Leute dürfen anfeuern, aber nicht mehr laufen oder werfen.</Rule>
        </ul>
        <WaterNote />
        <p className="muted small">Bitte nur mit Plastik- oder Dosengebinden spielen, auf Rasen, und nicht neben Omas Gemüsebeet.</p>
      </Panel>
    </div>
  );
}
