import { describe, expect, it } from 'vitest';
import { decodeHandTiles, encodeHandTiles, HandTilesParseError, parseTiles } from './handTiles';
import { initialHandState, type HandState } from './handState';
import type { Tile } from '../../scorer/types';

const hand = (over: Partial<HandState>): HandState => ({ ...initialHandState, ...over });

describe('tile atom parsing', () => {
  it('scans a run of concatenated atoms', () => {
    expect(parseTiles('m1m2m3')).toEqual(['m1', 'm2', 'm3']);
  });

  it('prefers the longer atom where one is a prefix of another', () => {
    // m5R before m5, and wh before w -- the case DATA_MODEL calls out.
    expect(parseTiles('m5Rm5')).toEqual(['m5R', 'm5']);
    expect(parseTiles('whw')).toEqual(['wh', 'w']);
  });

  it('reads `s` as South and `s1` as a souzu', () => {
    expect(parseTiles('ss1')).toEqual(['s', 's1']);
    expect(parseTiles('s5Rs')).toEqual(['s5R', 's']);
  });

  it('rejects text that is not a tile', () => {
    expect(() => parseTiles('m1zz')).toThrow(HandTilesParseError);
  });
});

describe('hand encoding', () => {
  it('keeps the concealed tiles in insertion order, winning tile last', () => {
    const state = hand({ concealed: ['m9', 'm1', 'm5R'] as Tile[] });
    expect(encodeHandTiles(state)).toBe('m9m1m5R');
    expect(decodeHandTiles('m9m1m5R').concealed.at(-1)).toBe('m5R');
  });

  it('records melds as melds, not as loose tiles', () => {
    const state = hand({
      concealed: ['m2', 'm2'] as Tile[],
      melds: [{ kind: 'chii', tiles: ['s3', 's4', 's5R'] }],
    });
    expect(encodeHandTiles(state)).toBe('m2m2|chii:s3s4s5R');
  });

  it('round-trips a full hand, melds and indicators included', () => {
    const state = hand({
      concealed: ['m2', 'm2', 'm3', 'm4', 'p3', 'p4', 'p5', 's3', 's4', 's5'] as Tile[],
      melds: [
        { kind: 'pon', tiles: ['e', 'e', 'e'] },
        { kind: 'kanC', tiles: ['p5', 'p5', 'p5', 'p5R'] },
      ],
      doraIndicators: ['m9', 'wh'] as Tile[],
      uraIndicators: ['s1'] as Tile[],
    });
    const back = decodeHandTiles(encodeHandTiles(state));
    expect(back.concealed).toEqual(state.concealed);
    expect(back.melds).toEqual(state.melds);
    expect(back.doraIndicators).toEqual(state.doraIndicators);
    expect(back.uraIndicators).toEqual(state.uraIndicators);
  });

  it('round-trips a hand with no melds or indicators', () => {
    const state = hand({ concealed: ['e', 'e', 's', 's'] as Tile[] });
    expect(decodeHandTiles(encodeHandTiles(state)).concealed).toEqual(state.concealed);
  });

  it('rejects a meld of the wrong size', () => {
    expect(() => decodeHandTiles('m1|pon:m2m2')).toThrow(HandTilesParseError);
  });

  it('rejects an unknown section', () => {
    expect(() => decodeHandTiles('m1|kong:m2m2m2m2')).toThrow(HandTilesParseError);
  });
});
