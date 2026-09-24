import { fuPartName } from './yakuNames';
import { describe, expect, it } from 'vitest';
import {
  concealedForDisplay, contextIssue, copiesUsed, disabledReason, initialHandState,
  firstRoundYakuman, isComplete, isHandOpen, modeIssue, startingHand, pressTile, reconcile, redAvailable, removeConcealed, setRedFives,
  toFlags, toSituation, toggleMode, toggleRed, winningTile, type HandState,
} from './handState';
import type { Tile } from '../../scorer/types';

const T = (s: string): Tile[] => s.split(' ') as Tile[];

/** Builds a state by pressing tiles in order, honouring the current mode. */
const build = (tiles: string, over: Partial<HandState> = {}): HandState =>
  T(tiles).reduce(pressTile, { ...initialHandState, ...over });

describe('adding concealed tiles', () => {
  it('keeps insertion order and treats the last tile as the winning tile', () => {
    const s = build('m3 m1 m2');
    expect(s.concealed).toEqual(T('m3 m1 m2'));
    expect(winningTile(s)).toBe('m2');
  });

  it('displays the rest sorted but holds the winning tile apart', () => {
    const { sorted, winning } = concealedForDisplay(build('s1 m9 p3 m1'));
    expect(sorted.map((e) => e.tile)).toEqual(T('m9 p3 s1'));
    expect(winning?.tile).toBe('m1');
  });

  it('removes by insertion index, not display position', () => {
    const s = build('s1 m9 p3');
    expect(removeConcealed(s, 0).concealed).toEqual(T('m9 p3'));
  });

  it('refuses a fifth copy, counting a red five as its plain twin', () => {
    // Three plain plus the red one is every copy of the 5m in the game.
    const s = pressTile(toggleRed(build('m5 m5 m5')), 'm5');
    expect(s.concealed).toEqual(T('m5 m5 m5 m5R'));
    expect(copiesUsed(s, 'm5')).toBe(4);
    expect(disabledReason(s, 'm5')).toMatch(/four copies/);
    expect(disabledReason(toggleRed(s), 'm5')).toMatch(/already used/);
  });

  it('stops accepting tiles once the hand is complete', () => {
    const s = build('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4 n n n');
    expect(isComplete(s)).toBe(true);
    expect(disabledReason(s, 'p1')).toMatch(/already complete/);
    expect(pressTile(s, 'p1')).toBe(s);
  });
});

describe('call modes', () => {
  it('builds a run from the tapped tile upward', () => {
    const s = pressTile(toggleMode(initialHandState, 'chii'), 'm3');
    expect(s.melds).toEqual([{ kind: 'chii', tiles: T('m3 m4 m5') }]);
  });

  it('disarms a call mode after use, but keeps dora armed', () => {
    expect(pressTile(toggleMode(initialHandState, 'pon'), 'm1').mode).toBeNull();
    expect(pressTile(toggleMode(initialHandState, 'dora'), 'm1').mode).toBe('dora');
  });

  it('toggles a mode off when reselected', () => {
    const armed = toggleMode(initialHandState, 'kan');
    expect(armed.mode).toBe('kan');
    expect(toggleMode(armed, 'kan').mode).toBeNull();
  });

  it('rejects honours and high starts for a run', () => {
    const chii = toggleMode(initialHandState, 'chii');
    expect(disabledReason(chii, 'e')).toMatch(/honours/);
    expect(disabledReason(chii, 'm8')).toMatch(/above 7/);
    expect(disabledReason(chii, 'm7')).toBeNull();
  });

  it('requires enough copies left for the whole call', () => {
    const twoFives = build('m5 m5');
    // A pon needs three more; only two remain.
    expect(disabledReason(toggleMode(twoFives, 'pon'), 'm5')).toMatch(/not enough copies/);
    // A kan needs four; one already used is fatal.
    expect(disabledReason(toggleMode(build('m5'), 'kan'), 'm5')).toMatch(/not enough copies/);
    expect(disabledReason(toggleMode(initialHandState, 'kan'), 'm5')).toBeNull();
  });

  it('checks every tile a run consumes, not just the one tapped', () => {
    const noFours = build('m4 m4 m4 m4');
    expect(disabledReason(toggleMode(noFours, 'chii'), 'm3')).toMatch(/not enough copies of m4/);
  });

  it('never lets a call be the move that completes the hand', () => {
    // 11 concealed + a pon would make 14 with no winning tile left to draw.
    const s = build('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4');
    expect(disabledReason(toggleMode(s, 'pon'), 'n')).toMatch(/cannot complete the hand/);
  });

  it('allows a kan that leaves room, since a kan raises the target size', () => {
    const s = build('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3');
    // 10 + 4 = 14 tiles against a target of 15, so one concealed tile remains.
    expect(disabledReason(toggleMode(s, 'kan'), 'n')).toBeNull();
  });

  it('caps melds at four', () => {
    let s = initialHandState;
    for (const t of T('m1 m4 m7 p1')) s = pressTile(toggleMode(s, 'chii'), t);
    expect(s.melds).toHaveLength(4);
    expect(disabledReason(toggleMode(s, 'pon'), 'e')).toMatch(/at most four melds/);
  });
});

describe('dora indicators', () => {
  it('stores what was tapped as an indicator, not as the dora itself', () => {
    const s = pressTile(toggleMode(pressTile(toggleRed(build('m5 m5 m5')), 'm5'), 'dora'), 'm5');
    expect(s.doraIndicators).toEqual(T('m5'));
    // The indicator points at m6, and indicators never consume hand tiles.
    expect(toSituation(s).dora).toEqual(T('m6'));
    expect(copiesUsed(s, 'm5')).toBe(4);
  });

  it('caps at five indicators', () => {
    const s = T('m1 m2 m3 m4 m5').reduce(pressTile, toggleMode(initialHandState, 'dora'));
    expect(s.doraIndicators).toHaveLength(5);
    expect(disabledReason(s, 'm6')).toMatch(/at most 5 indicators/);
  });

});

describe('the red-five modifier', () => {
  const red = (s: HandState = initialHandState) => toggleRed(s);

  it('adds the red copy of a lone five', () => {
    expect(pressTile(red(), 'm5').concealed).toEqual(T('m5R'));
  });

  it('disarms itself after one use, so only one five turns red', () => {
    const after = pressTile(red(), 'm5');
    expect(after.red).toBe(false);
    expect(pressTile(after, 'm5').concealed).toEqual(T('m5R m5'));
  });

  it('puts the red five anywhere in a run, which tapping alone cannot', () => {
    const chii = (start: string) =>
      pressTile(toggleRed(toggleMode(initialHandState, 'chii')), start as never).melds[0]!.tiles;
    expect(chii('m3')).toEqual(T('m3 m4 m5R'));   // red at the end
    expect(chii('m4')).toEqual(T('m4 m5R m6'));   // red in the middle
    expect(chii('m5')).toEqual(T('m5R m6 m7'));   // red at the start
  });

  it('reddens exactly one tile of a set, since only one red copy exists', () => {
    const pon = pressTile(toggleRed(toggleMode(initialHandState, 'pon')), 'm5');
    expect(pon.melds[0]!.tiles).toEqual(T('m5R m5 m5'));
    const kan = pressTile(toggleRed(toggleMode(initialHandState, 'kan')), 'p5');
    expect(kan.melds[0]!.tiles).toEqual(T('p5R p5 p5 p5'));
  });

  it('leaves an unmodified call entirely plain', () => {
    expect(pressTile(toggleMode(initialHandState, 'pon'), 'm5').melds[0]!.tiles)
      .toEqual(T('m5 m5 m5'));
  });

  it('only applies to fives, and says so', () => {
    expect(disabledReason(red(), 'm4')).toMatch(/only applies to fives/);
    expect(disabledReason(red(), 'm5')).toBeNull();
    expect(disabledReason(toggleRed(toggleMode(initialHandState, 'chii')), 'm1'))
      .toMatch(/containing a five/);
  });

  it('refuses a second red copy of the same five', () => {
    const held = pressTile(red(), 'm5');
    expect(held.concealed).toEqual(T('m5R'));
    expect(disabledReason(red(held), 'm5')).toMatch(/already used/);
    // The three plain copies remain available.
    expect(disabledReason(held, 'm5')).toBeNull();
  });

  it('is meaningless while marking dora, so it disarms', () => {
    expect(toggleMode(red(), 'dora').red).toBe(false);
  });
});

describe('only three of each five are plain', () => {
  it('exhausts the plain fives after three, pointing at the modifier', () => {
    const three = build('m5 m5 m5');
    expect(disabledReason(three, 'm5')).toMatch(/three plain fives/);
    // The red one is still there.
    expect(disabledReason(toggleRed(three), 'm5')).toBeNull();
  });

  it('blocks a plain five once a pon has taken all three', () => {
    const pon = pressTile(toggleMode(initialHandState, 'pon'), 'm5');
    expect(pon.melds[0]!.tiles).toEqual(T('m5 m5 m5'));
    expect(disabledReason(pon, 'm5')).toMatch(/three plain fives/);
    expect(disabledReason(toggleRed(pon), 'm5')).toBeNull();
  });

  it('puts the red five in a kan of fives automatically, since it is forced', () => {
    const open = pressTile(toggleMode(initialHandState, 'kan'), 'm5');
    expect(open.melds[0]!.tiles).toEqual(T('m5R m5 m5 m5'));
    const closed = pressTile(toggleMode(initialHandState, 'closedKan'), 'p5');
    expect(closed.melds[0]!.tiles).toEqual(T('p5R p5 p5 p5'));
  });

  it('leaves kans of other tiles alone', () => {
    const kan = pressTile(toggleMode(initialHandState, 'kan'), 'm4');
    expect(kan.melds[0]!.tiles).toEqual(T('m4 m4 m4 m4'));
  });

  it('refuses a pon of plain fives when only the plain supply is short', () => {
    // One plain five held: the pon needs three more plain, but only two remain,
    // even though four copies of the tile are not yet used.
    const one = build('m5');
    expect(copiesUsed(one, 'm5')).toBe(1);
    expect(disabledReason(toggleMode(one, 'pon'), 'm5')).toMatch(/only three plain m5 exist/);
  });
});

describe('ura indicators', () => {
  const riichi: HandState = { ...initialHandState, riichi: 'riichi' };

  it('need a riichi before they can be entered', () => {
    expect(modeIssue(initialHandState, 'uraDora')).toMatch(/requires a riichi/);
    expect(toggleMode(initialHandState, 'uraDora').mode).toBeNull();
    const s = pressTile(toggleMode(riichi, 'uraDora'), 'm1');
    expect(s.uraIndicators).toEqual(T('m1'));
  });

  it('go when the riichi is withdrawn, and so does the armed mode', () => {
    const s = reconcile({ ...toggleMode(riichi, 'uraDora'), uraIndicators: T('m1'), riichi: 'none' });
    expect(s.uraIndicators).toEqual([]);
    expect(s.mode).toBeNull();
  });
});

describe('calls in riichi', () => {
  const riichi: HandState = { ...initialHandState, riichi: 'dobleRiichi' };

  it('refuses the open calls, but not a concealed kan', () => {
    for (const mode of ['chii', 'pon', 'kan'] as const) {
      expect(modeIssue(riichi, mode)).toMatch(/no open calls/);
      expect(toggleMode(riichi, mode).mode).toBeNull();
      expect(modeIssue(initialHandState, mode)).toBeNull();
    }
    expect(toggleMode(riichi, 'closedKan').mode).toBe('closedKan');
  });

  it('disarms an armed call when a riichi is picked', () => {
    expect(reconcile({ ...toggleMode(initialHandState, 'pon'), riichi: 'riichi' }).mode).toBeNull();
  });
});

describe('context rules the engine does not enforce', () => {
  const open = (over: Partial<HandState> = {}): HandState =>
    ({ ...initialHandState, melds: [{ kind: 'pon', tiles: T('s3 s3 s3') as never }], ...over });

  it('treats an open meld as opening the hand, but not a concealed kan', () => {
    expect(isHandOpen(open())).toBe(true);
    expect(isHandOpen({ ...initialHandState, melds: [{ kind: 'kanC', tiles: T('m1 m1 m1 m1') as never }] }))
      .toBe(false);
  });

  it('blocks riichi on an open hand', () => {
    // The engine happily scores riichi here, so this rule has to live client-side.
    expect(contextIssue(open(), 'riichi')).toMatch(/closed hand/);
    expect(contextIssue(initialHandState, 'riichi')).toBeNull();
  });

  it('retracts a declared riichi when the hand is opened', () => {
    const s = reconcile(open({ riichi: 'riichi', ippatsu: true, uraIndicators: T('m1') }));
    expect(s.riichi).toBe('none');
    expect(s.ippatsu).toBe(false);
    // Without the riichi the ura have nothing to count for.
    expect(s.uraIndicators).toEqual([]);
  });

  it('ties chankan to ron and rinshan to tsumo', () => {
    expect(contextIssue({ ...initialHandState, winMode: 'tsumo' }, 'chankan')).toMatch(/always a ron/);
    expect(contextIssue({ ...initialHandState, winMode: 'ron' }, 'rinshan')).toMatch(/always a tsumo/);
  });

  it('requires a kan before rinshan', () => {
    const tsumo: HandState = { ...initialHandState, winMode: 'tsumo' };
    expect(contextIssue(tsumo, 'rinshan')).toMatch(/no kan/);
    expect(contextIssue({ ...tsumo, melds: [{ kind: 'kanC', tiles: T('m1 m1 m1 m1') as never }] }, 'rinshan'))
      .toBeNull();
  });

  it('clears chankan when the win switches to tsumo', () => {
    expect(reconcile({ ...initialHandState, chankan: true, winMode: 'tsumo' }).chankan).toBe(false);
  });

  it("rules out a dealer's first-round ron, which the engine would ignore", () => {
    const dealer = { ...initialHandState, seatWind: 'este' as const };
    expect(contextIssue({ ...dealer, winMode: 'ron' }, 'firstRound')).toMatch(/tenhou/);
    expect(contextIssue({ ...dealer, winMode: 'tsumo' }, 'firstRound')).toBeNull();
    // Switching a ticked tsumo to a ron takes the tick back.
    expect(reconcile({ ...dealer, winMode: 'ron', firstRound: true }).firstRound).toBe(false);
    expect(firstRoundYakuman({ ...dealer, winMode: 'tsumo' })).toBe('tenhou');
    expect(firstRoundYakuman({ ...initialHandState, seatWind: 'oeste', winMode: 'tsumo' })).toBe('chiihou');
    expect(firstRoundYakuman({ ...initialHandState, seatWind: 'norte', winMode: 'ron' })).toBe('renhou');
  });

  it('rules out a first-round win once any call has been made', () => {
    expect(contextIssue(open(), 'firstRound')).toMatch(/no calls/);
    expect(contextIssue({ ...initialHandState, riichi: 'riichi' }, 'firstRound')).toMatch(/riichi/);
    expect(contextIssue({ ...initialHandState, seatWind: 'sur' }, 'firstRound')).toBeNull();
  });
});

describe('flags', () => {
  it('maps the last-draw checkbox to haitei on tsumo and houtei on ron', () => {
    expect(toFlags({ ...initialHandState, lastDraw: true, winMode: 'tsumo' })).toContain('haitei');
    expect(toFlags({ ...initialHandState, lastDraw: true, winMode: 'ron' })).toContain('houtei');
  });

  it('emits the riichi choice as the matching atom', () => {
    expect(toFlags({ ...initialHandState, riichi: 'dobleRiichi' })).toEqual(['dobleRiichi']);
    expect(toFlags({ ...initialHandState, riichi: 'none' })).toEqual([]);
  });
});

describe('without red fives', () => {
  const noRed: HandState = { ...initialHandState, redFives: false };

  it('has no Red Five modifier', () => {
    expect(redAvailable(noRed)).toBe(false);
    expect(toggleRed(noRed).red).toBe(false);
  });

  it('allows all four fives plain, loose or called', () => {
    const loose = build('m5 m5 m5 m5', { redFives: false });
    expect(loose.concealed).toEqual(T('m5 m5 m5 m5'));
    expect(disabledReason(loose, 'm5')).toMatch(/four copies/);

    const pon = pressTile(toggleMode(build('p5', { redFives: false }), 'pon'), 'p5');
    expect(pon.melds[0]!.tiles).toEqual(T('p5 p5 p5'));
  });

  it('makes a kan of fives plain rather than forcing the red one in', () => {
    for (const mode of ['kan', 'closedKan'] as const) {
      const kan = pressTile(toggleMode(noRed, mode), 's5');
      expect(kan.melds[0]!.tiles).toEqual(T('s5 s5 s5 s5'));
    }
  });

  it('lets a chii through a five stay plain, and counts it against four copies', () => {
    const s = build('m5 m5 m5', { redFives: false });
    expect(disabledReason(toggleMode(s, 'chii'), 'm4')).toBeNull();
    expect(disabledReason(toggleMode(build('m5 m5 m5 m5', { redFives: false }), 'chii'), 'm4'))
      .toMatch(/not enough copies of m5/);
  });

  it('makes existing reds plain when switched off', () => {
    const red = pressTile(toggleRed(initialHandState), 'p5');
    const off = setRedFives({ ...red, doraIndicators: T('s5R') }, false);
    expect(off.concealed).toEqual(T('p5'));
    expect(off.doraIndicators).toEqual(T('s5'));
    expect(off.redFives).toBe(false);
  });
});

describe('carrying a hand on', () => {
  const setting = { sanma: false, redFives: true, rules: [] };
  const draft: HandState = {
    ...initialHandState,
    concealed: T('m2 m3 m4 p5 p6 p7 e e s6 s7 s8'),
    melds: [{ kind: 'pon', tiles: T('r r r') as never }],
    mode: 'dora',
  };

  it('keeps the tiles, and takes the new winds and win mode', () => {
    const { state, notice } = startingHand({
      ...setting, winds: { roundWind: 'este', seatWind: 'oeste' }, winMode: 'tsumo',
    }, draft);
    expect(state.concealed).toEqual(draft.concealed);
    expect(state.melds).toEqual(draft.melds);
    expect([state.seatWind, state.winMode, state.mode]).toEqual(['oeste', 'tsumo', null]);
    expect(notice).toBeNull();
  });

  it('drops open calls for a winner who declared riichi, and says so', () => {
    const withAnkan = { ...draft, melds: [...draft.melds, { kind: 'kanC' as const, tiles: T('m9 m9 m9 m9') as never }] };
    const { state, notice } = startingHand({ ...setting, riichiDeclared: true }, withAnkan);
    expect(state.melds.map((m) => m.kind)).toEqual(['kanC']);
    expect(state.riichi).toBe('riichi');
    expect(notice).toMatch(/riichi/);
  });

  it('takes a riichi away from a winner who never declared one, ura and all', () => {
    const inRiichi = { ...draft, melds: [], riichi: 'riichiAbierto' as const, uraIndicators: T('p1') };
    const { state } = startingHand({ ...setting, riichiDeclared: false }, inRiichi);
    expect(state.riichi).toBe('none');
    expect(state.uraIndicators).toEqual([]);
  });

  it('keeps an open or double riichi when the table only says "riichi"', () => {
    const open = { ...draft, melds: [], riichi: 'riichiAbierto' as const };
    expect(startingHand({ ...setting, riichiDeclared: true }, open).state.riichi).toBe('riichiAbierto');
  });
});

describe('fu breakdown lines', () => {
  it('reads each part as players would say it', () => {
    expect(fuPartName({ concept: 'juego', set: 'kanC', tiles: T('s9 s9 s9 s9'), fu: 32 }))
      .toBe('Closed kan of 9s');
    expect(fuPartName({ concept: 'par', tile: 's', fu: 4 })).toBe('Pair of South');
    expect(fuPartName({ concept: 'espera', wait: 'kanchan', fu: 2 })).toBe('Kanchan wait');
    expect(fuPartName({ concept: 'juegoCompletadoPorRon', set: 'triC', tiles: T('wh wh wh'), fu: 4 }))
      .toBe('Triplet of Haku, completed by ron');
  });
});
