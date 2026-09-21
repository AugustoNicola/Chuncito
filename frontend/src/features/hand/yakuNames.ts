/**
 * Display names for the engine's yaku atoms.
 *
 * Atoms are kept verbatim as keys so the two sides stay greppable; only the
 * presentation is translated. Anything unmapped falls back to the atom itself,
 * so a new upstream yaku shows up readably rather than blank.
 */
import type { Level } from '../../scorer/types';

export const YAKU_NAMES: Readonly<Record<string, string>> = {
  // situational
  riichi: 'Riichi', dobleRiichi: 'Double Riichi', ippatsu: 'Ippatsu',
  menzenTsumo: 'Menzen Tsumo', haitei: 'Haitei Raoyue', houtei: 'Houtei Raoyui',
  rinshan: 'Rinshan Kaihou', chankan: 'Chankan',
  // yakuhai
  bakazehai: 'Round Wind', jikazehai: 'Seat Wind',
  haku: 'Haku', hatsu: 'Hatsu', chun: 'Chun',
  // shape
  pinfu: 'Pinfu', tanyao: 'Tanyao', iipeikou: 'Iipeikou', ryanpeikou: 'Ryanpeikou',
  chiitoitsu: 'Chiitoitsu', sanshokuDoujun: 'Sanshoku Doujun', ittsuu: 'Ittsuu',
  chanta: 'Chantaiyao', junchan: 'Junchantaiyao', toitoi: 'Toitoi',
  sanAnkou: 'San Ankou', sanKantsu: 'San Kantsu', sanshokuDoukou: 'Sanshoku Doukou',
  shousangen: 'Shousangen', honroutou: 'Honroutou',
  honitsu: 'Honitsu', chinitsu: 'Chinitsu',
  // yakuman
  kokushiMusou: 'Kokushi Musou', suuAnkou: 'Suu Ankou', daisangen: 'Daisangen',
  shousuushii: 'Shousuushii', daisuushii: 'Daisuushii', tsuuiisou: 'Tsuuiisou',
  chinroutou: 'Chinroutou', ryuuiisou: 'Ryuuiisou', chuurenPoutou: 'Chuuren Poutou',
  suuKantsu: 'Suu Kantsu', tenhou: 'Tenhou', chiihou: 'Chiihou', renhou: 'Renhou',
  // appended last by the engine, counted rather than fixed
  dora: 'Dora', akaDora: 'Red Dora', uraDora: 'Ura Dora',
  // sanma; added by the client, not the engine
  nukiDora: 'Kita',
};

export const yakuName = (atom: string): string => YAKU_NAMES[atom] ?? atom;

const LEVEL_NAMES: Readonly<Record<string, string>> = {
  sinNombre: '', mangan: 'Mangan', haneman: 'Haneman', baiman: 'Baiman',
  sanbaiman: 'Sanbaiman', kazoeYakuman: 'Kazoe Yakuman',
  yakuman: 'Yakuman', dobleYakuman: 'Double Yakuman', tripleYakuman: 'Triple Yakuman',
};

/** Handles the generated tail ('4xYakuman', '5xYakuman', ...). */
export function levelName(level: Level): string {
  if (level in LEVEL_NAMES) return LEVEL_NAMES[level]!;
  const m = /^(\d+)xYakuman$/.exec(level);
  return m ? `${m[1]}× Yakuman` : level;
}

/**
 * Collapses a level onto the tier that drives its colour theme.
 *
 * The yakuman tail ('4xYakuman', ...) all share the yakuman treatment, and a
 * counted yakuman gets its own, slightly cooler one -- it is not the real thing.
 */
export function levelTier(level: Level): string {
  switch (level) {
    case 'sinNombre': return 'none';
    case 'mangan': return 'mangan';
    case 'haneman': return 'haneman';
    case 'baiman': return 'baiman';
    case 'sanbaiman': return 'sanbaiman';
    case 'kazoeYakuman': return 'kazoe';
    default: return 'yakuman';
  }
}

/** True for any genuine yakuman level, which gets the loudest treatment. */
export const isYakumanLevel = (level: Level): boolean =>
  level === 'yakuman' || level === 'kazoeYakuman' || /Yakuman$/.test(level);
