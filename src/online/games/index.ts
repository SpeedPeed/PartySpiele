import type { OnlineGameDef } from '../types';
import { abstimmung } from './abstimmung';
import { undercover } from './undercover';
import { spyfall } from './spyfall';
import { werwolf } from './werwolf';
import { quiz } from './quiz';
import { beichte } from './beichte';
import { schaetzen } from './schaetzen';
import { antworten } from './antworten';
import { montagsmaler } from './montagsmaler';
import { bluff } from './bluff';

export const ONLINE_GAMES: OnlineGameDef[] = [undercover, werwolf, spyfall, quiz, antworten, montagsmaler, bluff, abstimmung, beichte, schaetzen];
