import { beforeAll, describe, expect, it } from 'vitest';
import { createScorer, ValidationError, type Scorer } from './engine';
import { nodeSwiplFactory } from './engine.node';
import { serializeQuery, serializeHand, serializeMeld } from './serialize';
import { sortTiles, tilesInOrder } from './order';
import { validateQuery } from './validate';
import type { ScoreQuery, Tile } from './types';

let scorer: Scorer;
beforeAll(async () => { scorer = await createScorer(nodeSwiplFactory); }, 60_000);

const q = (over: Partial<ScoreQuery> & Pick<ScoreQuery, 'hand' | 'winningTile'>): ScoreQuery => ({
  mode: 'ron',
  situation: { roundWind: 'este', seatWind: 'sur', dora: [], uraDora: [], flags: [] },
  ...over,
});

const T = (s: string): Tile[] => s.split(' ') as Tile[];

describe('canonical ordering (orden.pl)', () => {
  it('orders man < pin < sou < honor, honours E,S,W,N,wh,g,r', () => {
    expect(sortTiles(T('r g wh n w s e s1 p1 m1'))).toEqual(T('m1 p1 s1 e s w n wh g r'));
  });

  it('sorts a red five immediately after its plain twin', () => {
    expect(sortTiles(T('m5R m5 m4 m6'))).toEqual(T('m4 m5 m5R m6'));
  });

  it('serializes melds in canonical order even when given scrambled input', () => {
    // An out-of-order meld does not error upstream -- it silently fails.
    expect(serializeMeld({ kind: 'chii', tiles: T('s8 s6 s7') as [Tile, Tile, Tile] }))
      .toBe('chii(s6,s7,s8)');
    expect(tilesInOrder(T('s6 s7 s8'))).toBe(true);
    expect(tilesInOrder(T('s8 s6 s7'))).toBe(false);
  });
});

describe('scoring, end to end', () => {
  it('scores the reference ron hand exactly as the CLI does', () => {
    const out = scorer.score(q({
      hand: { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
      winningTile: 'm5',
    }));
    expect(out).toEqual({
      ok: true,
      result: {
        yakus: [
          { yaku: 'pinfu', han: 1 },
          { yaku: 'tanyao', han: 1 },
          { yaku: 'sanshokuDoujun', han: 2 },
        ],
        han: 4, fu: 30, level: 'sinNombre',
        payment: { kind: 'ron', total: 7700 },
      },
    });
  });

  it('reports a yaku-less hand as a normal outcome, not an exception', () => {
    const out = scorer.score(q({
      hand: { concealed: T('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4 n n n'), melds: [] },
      winningTile: 'm4',
    }));
    expect(out).toEqual({ ok: false, reason: 'noWinningHand' });
  });

  it('distinguishes the three payment shapes', () => {
    const hand = { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] };
    const ron = scorer.score(q({ hand, winningTile: 'm5' }));
    const tsumo = scorer.score(q({ hand, winningTile: 'm5', mode: 'tsumo' }));
    const dealer = scorer.score(q({
      hand, winningTile: 'm5', mode: 'tsumo',
      situation: { roundWind: 'este', seatWind: 'este', dora: [], uraDora: [], flags: [] },
    }));
    expect(ron.ok && ron.result.payment).toEqual({ kind: 'ron', total: 7700 });
    expect(tsumo.ok && tsumo.result.payment).toEqual({ kind: 'tsumo', nonDealer: 2000, dealer: 4000 });
    expect(dealer.ok && dealer.result.payment).toEqual({ kind: 'tsumoDealer', each: 4000 });
  });

  it('separates dora, aka dora and ura dora from real yaku', () => {
    const out = scorer.score(q({
      hand: { concealed: T('m2 m2 m3 m4 m5R p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
      winningTile: 'm5R',
      mode: 'tsumo',
      situation: {
        roundWind: 'este', seatWind: 'este',
        dora: T('m6'), uraDora: T('p4'), flags: ['riichi', 'ippatsu'],
      },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const names = out.result.yakus.map((y) => y.yaku);
    expect(names.slice(-3)).toEqual(['dora', 'akaDora', 'uraDora']);
    expect(out.result.level).toBe('baiman');
  });

  it('handles an open kan and a closed kan, and keeps the hand closed for the ankan', () => {
    const base = { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5'), melds: [] };
    const open = scorer.score(q({
      hand: { ...base, melds: [{ kind: 'kanA', tiles: T('m1 m1 m1 m1') as [Tile,Tile,Tile,Tile] }] },
      winningTile: 'm5',
    }));
    const closed = scorer.score(q({
      hand: { ...base, melds: [{ kind: 'kanC', tiles: T('m1 m1 m1 m1') as [Tile,Tile,Tile,Tile] }] },
      winningTile: 'm5',
    }));
    // sanshokuDoujun is worth 1 han open, 2 closed -- an ankan does not open a hand.
    expect(open.ok && open.result.yakus).toEqual([{ yaku: 'sanshokuDoujun', han: 1 }]);
    expect(closed.ok && closed.result.yakus).toEqual([{ yaku: 'sanshokuDoujun', han: 2 }]);
    expect(closed.ok && closed.result.fu).toBe(70);
  });

  it('parses a stacked yakuman level (suuankou + chinroutou)', () => {
    const out = scorer.score(q({
      hand: { concealed: T('m1 m1 m1 m9 m9 m9 p1 p1 p1 p9 p9 p9 s1 s1'), melds: [] },
      winningTile: 's1', mode: 'tsumo',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.yakus).toEqual([
      { yaku: 'suuAnkou', han: 13 },
      { yaku: 'chinroutou', han: 13 },
    ]);
    // Each yakuman is a flat 13 han; fu is 0 whenever a yakuman applies.
    expect(out.result.han).toBe(26);
    expect(out.result.fu).toBe(0);
    expect(out.result.level).toBe('dobleYakuman');
    expect(out.result.payment).toEqual({ kind: 'tsumo', nonDealer: 16000, dealer: 32000 });
  });
});

describe('validation catches what the engine ignores', () => {
  it('rejects a fifth copy of a tile', () => {
    const issues = validateQuery(q({
      hand: { concealed: T('m1 m1 m1 m1 m1 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
      winningTile: 'm8',
    }));
    expect(issues.map((i) => i.code)).toContain('tile.tooMany');
  });

  it('counts a red five against its plain twin', () => {
    const codes = (tiles: string) => validateQuery(q({
      hand: { concealed: T(tiles), melds: [] },
      winningTile: 'm8',
    })).map((i) => i.code);

    // m5,m5,m5,m5R is exactly the four copies that exist -- legal.
    expect(codes('m5 m5 m5 m5R p3 p4 p5 s3 s4 s5 m6 m7 m8 m1')).not.toContain('tile.tooMany');
    // A fifth is not, even though only one of them is red.
    expect(codes('m5 m5 m5 m5 m5R p4 p5 s3 s4 s5 m6 m7 m8 m1')).toContain('tile.tooMany');
  });

  it('rejects a second red five of the same suit', () => {
    const issues = validateQuery(q({
      hand: { concealed: T('m5R m5R m3 m4 p3 p4 p5 s3 s4 s5 m6 m7 m8 m1'), melds: [] },
      winningTile: 'm8',
    }));
    expect(issues.map((i) => i.code)).toContain('tile.tooManyRed');
  });

  it('rejects a bogus wind and an unknown flag, which the engine silently scores', () => {
    const issues = validateQuery(q({
      hand: { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
      winningTile: 'm5',
      situation: {
        roundWind: 'marte' as never, seatWind: 'sur',
        dora: [], uraDora: [], flags: ['volar' as never],
      },
    }));
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['wind.unknown', 'flag.unknown']),
    );
  });

  it('enforces flag compatibility rules', () => {
    const check = (flags: string[]) => validateQuery(q({
      hand: { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
      winningTile: 'm5',
      situation: { roundWind: 'este', seatWind: 'sur', dora: [], uraDora: [], flags: flags as never },
    })).map((i) => i.code);

    expect(check(['riichi', 'dobleRiichi'])).toContain('flag.incompatible');
    expect(check(['haitei', 'rinshan'])).toContain('flag.incompatible');
    expect(check(['primeraRonda', 'ippatsu'])).toContain('flag.incompatible');
    expect(check(['ippatsu'])).toContain('flag.ippatsuWithoutRiichi');
    expect(check(['riichi', 'ippatsu'])).toEqual([]);
  });

  it('rejects a hand whose size does not account for kans', () => {
    const issues = validateQuery(q({
      hand: {
        concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4'),   // one short
        melds: [{ kind: 'kanA', tiles: T('m1 m1 m1 m1') as [Tile,Tile,Tile,Tile] }],
      },
      winningTile: 'm5',
    }));
    expect(issues.map((i) => i.code)).toContain('hand.size');
  });

  it('rejects a winning tile that is not in the hand', () => {
    const issues = validateQuery(q({
      hand: { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
      winningTile: 'p9',
    }));
    expect(issues.map((i) => i.code)).toContain('winningTile.absent');
  });

  it('rejects malformed melds', () => {
    const codes = (m: unknown) => validateQuery(q({
      hand: { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5'), melds: [m as never] },
      winningTile: 'm5',
    })).map((i) => i.code);
    expect(codes({ kind: 'chii', tiles: T('e s w') })).toContain('chii.honor');
    expect(codes({ kind: 'chii', tiles: T('m1 m2 m4') })).toContain('chii.notConsecutive');
    expect(codes({ kind: 'pon', tiles: T('m1 m1 m2') })).toContain('set.mixed');
  });

  it('throws ValidationError from score() rather than returning a failure', () => {
    expect(() => scorer.score(q({
      hand: { concealed: T('m1 m1'), melds: [] },
      winningTile: 'm1',
    }))).toThrow(ValidationError);
  });
});

describe('serialization', () => {
  it('emits a goal the engine accepts verbatim', () => {
    const goal = serializeQuery(q({
      hand: {
        concealed: T('m2 m2 m3 m4 m5 p3 p4 p5'),
        melds: [{ kind: 'chii', tiles: T('s8 s6 s7') as [Tile, Tile, Tile] }],
      },
      winningTile: 'm5',
    }));
    expect(goal).toBe(
      'resultadoDeVictoria(mano([m2,m2,m3,m4,m5,p3,p4,p5],[chii(s6,s7,s8)]),' +
      'm5,ron,situacion(este,sur,[],[],[]),R)',
    );
  });

  it('sorts concealed tiles so goals are stable', () => {
    expect(serializeHand({ concealed: T('r m1 s1 p1'), melds: [] }))
      .toBe('mano([m1,p1,s1,r],[])');
  });
});
