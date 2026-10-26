/** Ring of Fire / Kings Cup – eine Regel pro Kartenwert. */
export interface RofCard {
  rank: string;
  title: string;
  rule: string;
}

/** Klassische Variante mit Kings Cup. */
export const RING_OF_FIRE: RofCard[] = [
  {
    rank: 'Ass',
    title: 'Wasserfall',
    rule: 'Alle setzen an. Die ziehende Person beginnt, und reihum darf erst aufgehört werden, wenn die Person davor aufhört. Wer zu früh absetzt, nimmt zusätzlich {s:2}.',
  },
  {
    rank: '2',
    title: 'Du!',
    rule: 'Zeig auf eine Person – sie nimmt {s:2}.',
  },
  {
    rank: '3',
    title: 'Ich!',
    rule: 'Pech gehabt: Du selbst nimmst {s:3}.',
  },
  {
    rank: '4',
    title: 'Boden ist Lava',
    rule: 'Alle berühren mit der Hand den Boden. Wer als Letzte:r unten ist, nimmt {s:2}.',
  },
  {
    rank: '5',
    title: 'Daumenmeister:in',
    rule: 'Du bist Daumenmeister:in bis zur nächsten 5. Legst du unauffällig den Daumen auf den Tisch, müssen alle nachmachen. Wer zuletzt reagiert, nimmt {s:2}.',
  },
  {
    rank: '6',
    title: 'Prost, Gemeinde!',
    rule: 'Prost auf die Runde! Alle nehmen {s:1}.',
  },
  {
    rank: '7',
    title: 'Himmel',
    rule: 'Alle strecken eine Hand nach oben. Wer als Letzte:r zum Himmel zeigt, nimmt {s:2}.',
  },
  {
    rank: '8',
    title: 'Saufkumpan:in',
    rule: 'Wähl eine Person: Bis zur nächsten 8 nimmt sie jedes Mal mit, wenn du etwas nehmen musst – und umgekehrt.',
  },
  {
    rank: '9',
    title: 'Reim dich oder ich fress dich',
    rule: 'Sag ein Wort. Reihum muss jede:r ein Wort sagen, das sich darauf reimt. Wer hängt oder wiederholt, nimmt {s:2}.',
  },
  {
    rank: '10',
    title: 'Kategorie',
    rule: 'Nenn eine Kategorie (z. B. Biersorten, Skiorte). Reihum nennt jede:r einen Begriff. Wer zögert oder wiederholt, nimmt {s:2}.',
  },
  {
    rank: 'Bube',
    title: 'Neue Hausregel',
    rule: 'Stell eine Regel auf, die bis zum Ende des Spiels gilt (z. B. „Wer flucht, nimmt {s:1}“). Wer dagegen verstößt, kassiert die Strafe.',
  },
  {
    rank: 'Dame',
    title: 'Fragenmeister:in',
    rule: 'Bis zur nächsten Dame gilt: Wer eine Frage von dir beantwortet, nimmt {s:1}. Clever fragen lohnt sich!',
  },
  {
    rank: 'König',
    title: 'Kings Cup',
    rule: 'Schütte einen Schluck deines Getränks in den Kings Cup in der Mitte. Wer den 4. König zieht, kassiert den Kings Cup: {ex} – und das Spiel ist aus.',
  },
];

/** Harmlose Variante – funktioniert auch mit Strafpunkten statt Getränken. */
export const RING_OF_FIRE_HARMLOS: RofCard[] = [
  {
    rank: 'Ass',
    title: 'Kettenreaktion',
    rule: 'Alle nehmen {s:1} – in der Reihenfolge der Runde, beginnend bei dir. Wer zu langsam ist oder aus der Reihe tanzt, kassiert {s:1} extra.',
  },
  {
    rank: '2',
    title: 'Du!',
    rule: 'Zeig auf eine Person – sie kassiert {s:2}.',
  },
  {
    rank: '3',
    title: 'Ich!',
    rule: 'Pech gehabt: Du selbst kassierst {s:3}.',
  },
  {
    rank: '4',
    title: 'Boden ist Lava',
    rule: 'Alle berühren mit der Hand den Boden. Wer als Letzte:r unten ist, kassiert {s:2}.',
  },
  {
    rank: '5',
    title: 'Daumenmeister:in',
    rule: 'Du bist Daumenmeister:in bis zur nächsten 5. Legst du unauffällig den Daumen auf den Tisch, müssen alle nachmachen. Wer zuletzt reagiert, kassiert {s:2}.',
  },
  {
    rank: '6',
    title: 'Gruppenkuscheln',
    rule: 'Alle kassieren {s:1} – geteiltes Leid ist halbes Leid.',
  },
  {
    rank: '7',
    title: 'Himmel',
    rule: 'Alle strecken eine Hand nach oben. Wer als Letzte:r zum Himmel zeigt, kassiert {s:2}.',
  },
  {
    rank: '8',
    title: 'Buddy',
    rule: 'Wähl eine Person: Bis zur nächsten 8 kassiert sie jedes Mal mit, wenn du etwas kassierst – und umgekehrt.',
  },
  {
    rank: '9',
    title: 'Reim dich oder ich fress dich',
    rule: 'Sag ein Wort. Reihum muss jede:r ein Wort sagen, das sich darauf reimt. Wer hängt oder wiederholt, kassiert {s:2}.',
  },
  {
    rank: '10',
    title: 'Kategorie',
    rule: 'Nenn eine Kategorie (z. B. Automarken, Wiener Bezirke). Reihum nennt jede:r einen Begriff. Wer zögert oder wiederholt, kassiert {s:2}.',
  },
  {
    rank: 'Bube',
    title: 'Neue Hausregel',
    rule: 'Stell eine Regel auf, die bis zum Ende des Spiels gilt (z. B. „Wer Englisch redet, kassiert {s:1}“). Wer dagegen verstößt, kassiert die Strafe.',
  },
  {
    rank: 'Dame',
    title: 'Fragenmeister:in',
    rule: 'Bis zur nächsten Dame gilt: Wer eine Frage von dir beantwortet, kassiert {s:1}.',
  },
  {
    rank: 'König',
    title: 'Königsstrafe',
    rule: 'Erfinde eine Strafaufgabe und sag sie laut an (z. B. „Singt den Refrain eines Schlagers“). Wer den 4. König zieht, muss alle bisher angesagten Strafaufgaben erledigen – oder kassiert {ex}. Danach ist das Spiel aus.',
  },
];
