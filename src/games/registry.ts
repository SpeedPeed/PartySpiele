import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Category = 'trinken' | 'karten' | 'raten' | 'party' | 'tools';

export const CATEGORIES: { id: Category | 'online' | 'alle'; label: string; color: string }[] = [
  { id: 'alle', label: '★ Alle', color: 'var(--yellow)' },
  { id: 'trinken', label: '🍺 Trinkspiele', color: 'var(--pink)' },
  { id: 'online', label: '📡 Multi-Handy', color: 'var(--green)' },
  { id: 'karten', label: '🃏 Karten', color: 'var(--cyan)' },
  { id: 'raten', label: '🧠 Raten', color: 'var(--purple)' },
  { id: 'party', label: '🎉 Party', color: 'var(--orange)' },
  { id: 'tools', label: '🎲 Tools', color: 'var(--green)' },
];

export interface GameMeta {
  id: string;
  name: string;
  emoji: string;
  category: Category;
  tagline: string;
  color: string;
  /** Minimum number of players in the player list (0 = no list needed). */
  minPlayers: number;
  /** Shows the level (Stufe) selector. */
  levels?: boolean;
  rules: string[];
  component: LazyExoticComponent<ComponentType>;
}

const C = {
  pink: '#ff2e88',
  cyan: '#19e3ff',
  yellow: '#ffe03a',
  green: '#3dff6e',
  orange: '#ff8a1f',
  purple: '#a64dff',
  red: '#ff5f5f',
};

export const GAMES: GameMeta[] = [
  // ---------------- Trinkspiele ----------------
  {
    id: 'gaudi-mix',
    name: 'Gaudi-Mix',
    emoji: '🌀',
    category: 'trinken',
    tagline: 'Das Hauptspiel: Aufgaben, Regeln, Viren & Duelle',
    color: C.pink,
    minPlayers: 2,
    levels: true,
    rules: [
      'Einfach reihum vorlesen und tun, was auf der Karte steht.',
      'Regeln und Viren gelten so lange, bis die App sie wieder aufhebt.',
      'Aktive Regeln siehst du jederzeit unten im Spiel.',
      'Wer nicht will, nimmt die genannte Strafe – Ehrensache.',
    ],
    component: lazy(() => import('./GaudiMix')),
  },
  {
    id: 'wahrheit-pflicht',
    name: 'Wahrheit oder Pflicht',
    emoji: '😈',
    category: 'trinken',
    tagline: 'Der Klassiker – mit hunderten Fragen & Aufgaben',
    color: C.purple,
    minPlayers: 2,
    levels: true,
    rules: [
      'Die App wählt, wer dran ist. Diese Person wählt Wahrheit oder Pflicht.',
      'Wer kneift, kassiert Strafschlucke (zählt in der Statistik).',
      'Mit „Zufall“ entscheidet das Schicksal.',
    ],
    component: lazy(() => import('./WahrheitPflicht')),
  },
  {
    id: 'ich-hab-noch-nie',
    name: 'Ich hab noch nie',
    emoji: '🙊',
    category: 'trinken',
    tagline: 'Wer’s schon gemacht hat, trinkt',
    color: C.cyan,
    minPlayers: 0,
    levels: true,
    rules: ['Satz vorlesen: „Ich hab noch nie …“', 'Alle, die es schon getan haben, nehmen einen Schluck.', 'Gute Geschichten dazu sind Pflicht!'],
    component: lazy(() => import('./IchHabNochNie')),
  },
  {
    id: 'wer-wuerde-eher',
    name: 'Wer würde eher',
    emoji: '👉',
    category: 'trinken',
    tagline: 'Auf 3 zeigen alle auf jemanden',
    color: C.yellow,
    minPlayers: 0,
    levels: true,
    rules: ['Frage vorlesen, bis 3 zählen, alle zeigen gleichzeitig auf eine Person.', 'Pro Finger, der auf dich zeigt, nimmst du einen Schluck.'],
    component: lazy(() => import('./WerWuerdeEher')),
  },
  {
    id: 'paranoia',
    name: 'Paranoia',
    emoji: '🤫',
    category: 'trinken',
    tagline: 'Flüster-Frage, laut gesagte Antwort',
    color: C.green,
    minPlayers: 3,
    levels: true,
    rules: [
      'Das Handy geht an eine Person, die die geheime Frage liest.',
      'Sie sagt laut nur einen Namen aus der Runde.',
      'Die genannte Person kann einen Münzwurf wagen: Kopf = die Frage wird verraten, aber sie trinkt.',
    ],
    component: lazy(() => import('./Paranoia')),
  },
  {
    id: 'entweder-oder',
    name: 'Würdest du eher',
    emoji: '⚖️',
    category: 'trinken',
    tagline: 'Unmögliche Entscheidungen',
    color: C.orange,
    minPlayers: 0,
    levels: true,
    rules: ['Alle entscheiden sich gleichzeitig (Hand links = A, rechts = B).', 'Die Minderheit trinkt. Unentschieden? Alle trinken!'],
    component: lazy(() => import('./EntwederOder')),
  },
  {
    id: 'heisser-stuhl',
    name: 'Heißer Stuhl',
    emoji: '🔥',
    category: 'trinken',
    tagline: '2 Minuten Kreuzverhör',
    color: C.red,
    minPlayers: 2,
    levels: true,
    rules: [
      'Eine Person sitzt auf dem heißen Stuhl.',
      'Die anderen stellen 2 Minuten lang Fragen (Vorschläge liefert die App).',
      'Jede verweigerte Antwort = 2 Schlucke.',
    ],
    component: lazy(() => import('./HeisserStuhl')),
  },
  {
    id: 'deep-talk',
    name: 'Deep Talk um 3',
    emoji: '🌙',
    category: 'trinken',
    tagline: 'Für die späte Runde am Küchentisch',
    color: C.purple,
    minPlayers: 0,
    levels: true,
    rules: ['Frage vorlesen, reihum antworten.', 'Keine Strafen, nur ehrliche Antworten. Prost!'],
    component: lazy(() => import('./DeepTalk')),
  },
  {
    id: 'reaktion',
    name: 'Reaktions-Duell',
    emoji: '⚡',
    category: 'trinken',
    tagline: 'Bis zu 4 Finger auf einem Handy',
    color: C.yellow,
    minPlayers: 0,
    rules: [
      'Jede Person legt einen Finger auf ihr Feld.',
      'Sobald der Bildschirm GRÜN wird: tippen!',
      'Wer zu früh tippt oder am langsamsten ist, trinkt.',
    ],
    component: lazy(() => import('./Reaktion')),
  },

  // ---------------- Karten ----------------
  {
    id: 'ring-of-fire',
    name: 'Ring of Fire',
    emoji: '👑',
    category: 'karten',
    tagline: 'Kings Cup mit 52 Karten',
    color: C.red,
    minPlayers: 0,
    rules: [
      'Reihum eine Karte ziehen, die App zeigt die Regel.',
      'Wer den 4. König zieht, trinkt den Kings Cup.',
      'Die Regeln der Karten siehst du jederzeit in der Übersicht.',
    ],
    component: lazy(() => import('./RingOfFire')),
  },
  {
    id: 'busfahrer',
    name: 'Busfahrer',
    emoji: '🚌',
    category: 'karten',
    tagline: '4 Fragen, Pyramide, dann die Busfahrt',
    color: C.yellow,
    minPlayers: 2,
    rules: [
      'Runde 1: Jede Person beantwortet 4 Fragen (Rot/Schwarz, Höher/Tiefer, Innerhalb/Außerhalb, Farbe). Falsch = trinken.',
      'Runde 2: Die Pyramide wird aufgedeckt. Wer eine passende Karte hat, verteilt Schlucke (Reihe = Anzahl).',
      'Runde 3: Wer am Ende die meisten Karten hat, muss Bus fahren: 5 Karten höher/tiefer am Stück richtig raten.',
    ],
    component: lazy(() => import('./Busfahrer')),
  },
  {
    id: 'hoeher-tiefer',
    name: 'Höher oder Tiefer',
    emoji: '📈',
    category: 'karten',
    tagline: 'Streak-Jagd – wer verkackt, trinkt',
    color: C.cyan,
    minPlayers: 0,
    rules: ['Rate, ob die nächste Karte höher oder tiefer ist.', 'Falsch = so viele Schlucke wie die Serie lang war.', 'Gleich = alle trinken!', 'Nach 3 Richtigen darfst du weitergeben.'],
    component: lazy(() => import('./HoeherTiefer')),
  },

  // ---------------- Raten ----------------
  {
    id: 'wer-bin-ich',
    name: 'Wer bin ich?',
    emoji: '🤔',
    category: 'raten',
    tagline: 'Handy an die Stirn & kippen',
    color: C.green,
    minPlayers: 0,
    rules: [
      'Halte das Handy quer an deine Stirn.',
      'Die anderen erklären den Begriff.',
      'Nach unten kippen = richtig, nach oben kippen = weiter. Alternativ tippen.',
    ],
    component: lazy(() => import('./WerBinIch')),
  },
  {
    id: 'tabu',
    name: 'Tabu',
    emoji: '🚫',
    category: 'raten',
    tagline: 'Erklär’s ohne die verbotenen Wörter',
    color: C.pink,
    minPlayers: 0,
    rules: [
      'Zwei Teams. Eine Person erklärt, das eigene Team rät.',
      'Die 5 Wörter auf der Karte sind verboten – das Gegnerteam passt auf!',
      'Richtig = +1, Tabu = −1, Überspringen kostet nichts.',
    ],
    component: lazy(() => import('./Tabu')),
  },
  {
    id: 'activity',
    name: 'Activity',
    emoji: '🎭',
    category: 'raten',
    tagline: 'Zeichnen, Erklären oder Pantomime',
    color: C.orange,
    minPlayers: 0,
    rules: [
      'Teams spielen abwechselnd. Die App würfelt die Darstellungsart.',
      'Schwierigkeit wählen: leicht 1, mittel 2, schwer 3 Punkte.',
      'Wer zuerst die Zielpunktzahl hat, gewinnt.',
    ],
    component: lazy(() => import('./Activity')),
  },
  {
    id: 'wortbombe',
    name: 'Wortbombe',
    emoji: '💣',
    category: 'raten',
    tagline: 'Begriff nennen & weitergeben – BOOM',
    color: C.red,
    minPlayers: 0,
    rules: [
      'Die App zeigt eine Kategorie. Nenne einen passenden Begriff und gib das Handy weiter.',
      'Der Timer ist geheim. Wer das Handy hält, wenn die Bombe hochgeht, trinkt.',
      'Wiederholungen oder Zögern gelten nicht!',
    ],
    component: lazy(() => import('./Wortbombe')),
  },
  {
    id: 'zungenbrecher',
    name: 'Zungenbrecher',
    emoji: '👅',
    category: 'raten',
    tagline: 'Mit 3 Promille noch schwerer',
    color: C.purple,
    minPlayers: 0,
    rules: ['Zungenbrecher 3× schnell hintereinander sagen.', 'Wer sich verhaspelt, nimmt einen Schluck.'],
    component: lazy(() => import('./Zungenbrecher')),
  },

  // ---------------- Party ----------------
  {
    id: 'turnier',
    name: 'Bierpong & Flunkyball',
    emoji: '🏓',
    category: 'party',
    tagline: 'Turnierbaum, Ergebnisse, Regeln',
    color: C.orange,
    minPlayers: 0,
    rules: ['Teams anlegen, Turnier starten, Sieger eintragen.', 'Die App baut den Turnierbaum (inkl. Freilos).', 'Offizielle Gaudi-Regeln für Bierpong & Flunkyball im Spiel.'],
    component: lazy(() => import('./Turnier')),
  },
  {
    id: 'regel-generator',
    name: 'Hausregeln',
    emoji: '📜',
    category: 'party',
    tagline: 'Zufällige Regeln für den ganzen Abend',
    color: C.yellow,
    minPlayers: 0,
    levels: true,
    rules: ['Würfle neue Regeln aus, sie gelten den ganzen Abend.', 'Wer gegen eine Regel verstößt, kassiert die Strafe.'],
    component: lazy(() => import('./RegelGenerator')),
  },

  // ---------------- Tools ----------------
  {
    id: 'flaschendrehen',
    name: 'Flaschendrehen',
    emoji: '🍾',
    category: 'tools',
    tagline: 'Wisch und dreh',
    color: C.green,
    minPlayers: 0,
    rules: ['Handy in die Mitte legen und die Flasche anwischen.', 'Worauf sie zeigt, die Person ist dran.'],
    component: lazy(() => import('../tools/Flaschendrehen')),
  },
  {
    id: 'gluecksrad',
    name: 'Glücksrad',
    emoji: '🎡',
    category: 'tools',
    tagline: 'Strafen, Namen oder eigene Felder',
    color: C.pink,
    minPlayers: 0,
    rules: ['Drehen und tun, was das Rad sagt.', 'Eigene Felder kannst du unter „Eigene Inhalte“ anlegen.'],
    component: lazy(() => import('../tools/Gluecksrad')),
  },
  {
    id: 'finger',
    name: 'Wer fängt an?',
    emoji: '☝️',
    category: 'tools',
    tagline: 'Alle Finger aufs Display',
    color: C.cyan,
    minPlayers: 0,
    rules: ['Alle legen einen Finger aufs Display.', 'Nach kurzer Zeit wählt die App zufällig einen Finger aus.'],
    component: lazy(() => import('../tools/Finger')),
  },
  {
    id: 'wuerfel',
    name: 'Würfel & Münze',
    emoji: '🎲',
    category: 'tools',
    tagline: 'Würfel, Trinkwürfel, Münzwurf',
    color: C.yellow,
    minPlayers: 0,
    rules: ['Normaler Würfel, 2 Würfel, Trinkwürfel und Münze.', 'Schütteln zum Würfeln (falls dein Handy das erlaubt).'],
    component: lazy(() => import('../tools/Wuerfel')),
  },
  {
    id: 'zehn-sekunden',
    name: '10-Sekunden-Challenge',
    emoji: '⏱️',
    category: 'tools',
    tagline: 'Stopp genau bei 10,00',
    color: C.purple,
    minPlayers: 0,
    rules: ['Starten, im Kopf mitzählen, bei genau 10 Sekunden stoppen.', 'Wer am weitesten daneben liegt, trinkt die Differenz in Schlucken.'],
    component: lazy(() => import('../tools/ZehnSekunden')),
  },
  {
    id: 'zufall',
    name: 'Zufalls-Picker',
    emoji: '🎯',
    category: 'tools',
    tagline: 'Spieler, Teams & Reihenfolge',
    color: C.orange,
    minPlayers: 0,
    rules: ['Zufällige Person wählen, Teams bilden oder eine Reihenfolge auslosen.'],
    component: lazy(() => import('../tools/Zufall')),
  },
];

export function gameById(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}
