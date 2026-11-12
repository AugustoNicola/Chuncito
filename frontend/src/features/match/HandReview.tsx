/**
 * A won hand, read back: the score screen as it looked when the hand was
 * scored -- tiles, the limit's fire, the total, the yaku -- rebuilt from what
 * the hand row stores. Opened from a hand in the timeline or a match's
 * history, and from a "Best hand" box; Back returns to where it was opened.
 *
 * Rebuilt rather than re-scored: the row's yaku, han, fu and base points are
 * what was recorded, and asking the engine again could only disagree with
 * them. The one thing the row does not keep is the fu breakdown, so that is
 * left out; a hand typed in as han and fu has no tiles and no yaku to show.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Payment } from '../../scorer/types';
import { decodeHandTiles } from '../hand/handTiles';
import type { HandState } from '../hand/handState';
import { ScoreResultView } from '../hand/ScoreResultView';
import type { HandRow, MatchState, WinRow } from './matchState';
import { type Seat, dealerOf, roundLabel, seatWindOf, turnDistance } from './seats';
import { honbaRatesOf, paymentFor } from './scoring';
import { wallOfRow, wonAfterRiichi } from './yakuWall';

/** Which hand is open: a hand by its `seq`, and, from a Best hand, one winner of it. */
export interface Reviewed { seq: number; winner?: Seat }

const PARAM = 'hand';
const encode = (r: Reviewed) => (r.winner === undefined ? `${r.seq}` : `${r.seq}.${r.winner}`);
function decode(text: string | null): Reviewed | null {
  const m = text ? /^(\d+)(?:\.(\d))?$/.exec(text) : null;
  return m ? { seq: Number(m[1]), winner: m[2] === undefined ? undefined : Number(m[2]) as Seat } : null;
}

/**
 * Which hand is open, and the way in and out.
 *
 * Inside a match the review is plain state: a match blocks every navigation
 * (`MatchScreen`), and its own Back is the way out. Everywhere else it is in
 * the address, `?hand=`, so the phone's back gesture closes it as Back does
 * and a link to a reviewed hand opens it.
 */
export function useHandReview(inMatch: boolean): {
  reviewed: Reviewed | null; open: (r: Reviewed) => void; close: () => void;
} {
  const [local, setLocal] = useState<Reviewed | null>(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const open = useCallback((r: Reviewed) => {
    if (inMatch) { setLocal(r); return; }
    setParams((p) => { p.set(PARAM, encode(r)); return p; }, { state: { review: true } });
  }, [inMatch, setParams]);

  const close = useCallback(() => {
    if (inMatch) { setLocal(null); return; }
    // Opened from this page: step back to it. Arrived on the link itself:
    // drop the hand from the address instead of leaving the app.
    if ((location.state as { review?: boolean } | null)?.review) navigate(-1);
    else setParams((p) => { p.delete(PARAM); return p; }, { replace: true });
  }, [inMatch, location.state, navigate, setParams]);

  return { reviewed: inMatch ? local : decode(params.get(PARAM)), open, close };
}

/** A hand worth opening: one with a winner. */
export const reviewable = (row: HandRow): boolean => row.wins.length > 0;

/** What the winner was paid for the hand itself, honba and sticks aside. */
function paymentOf(win: WinRow, row: HandRow, state: MatchState): Payment | null {
  const dealer = dealerOf({ wind: row.roundWind, number: row.roundNumber }, state.config.players);
  const mode = row.outcome === 'tsumo' ? 'tsumo' : 'ron';
  if (win.basePoints !== null) return paymentFor(win.basePoints, win.winnerSeat === dealer, mode);
  return win.pointsWon !== null ? { kind: 'ron', total: win.pointsWon } : null;
}

/**
 * Who took the honba: the only winner, or of several on one discard the
 * nearest to the discarder, as `recordHand` paid it.
 */
function honbaTaker(row: HandRow, players: 3 | 4): Seat | null {
  if (row.wins.length === 0) return null;
  if (row.dealInSeat === null || row.wins.length === 1) return row.wins[0]!.winnerSeat;
  const from = row.dealInSeat;
  return [...row.wins].sort((a, b) =>
    turnDistance(from, a.winnerSeat, players) - turnDistance(from, b.winnerSeat, players))[0]!.winnerSeat;
}

function WinReview({ state, row, win }: { state: MatchState; row: HandRow; win: WinRow }) {
  const players = state.config.players;
  const names = state.config.seats.map((s) => s.name);
  const payment = paymentOf(win, row, state);
  if (!payment || win.han === null || win.level === null) {
    return <p className="handreview__none">{names[win.winnerSeat]}: no score was kept for this hand.</p>;
  }
  const round = { wind: row.roundWind, number: row.roundNumber };
  let hand: HandState | undefined;
  try {
    hand = win.handTiles ? decodeHandTiles(win.handTiles, players === 3) : undefined;
  } catch {
    hand = undefined;
  }
  // What the score screen reads off the hand: whose seat, and how it was won.
  const context = {
    ...(hand ?? decodeHandTiles('', players === 3)),
    seatWind: seatWindOf(win.winnerSeat, round, players),
    roundWind: row.roundWind,
    winMode: row.outcome === 'tsumo' ? 'tsumo' as const : 'ron' as const,
  };
  const wall = wallOfRow(row);
  const taker = honbaTaker(row, players);

  return (
    <ScoreResultView
      result={{ yakus: win.yakus, han: win.han, fu: win.fu ?? 0, level: win.level, payment, fuParts: [] }}
      hand={context}
      showTiles={hand !== undefined}
      attribution={{
        winner: names[win.winnerSeat]!,
        dealIn: row.dealInSeat === null ? undefined : names[row.dealInSeat],
      }}
      honba={taker === win.winnerSeat ? row.honba : 0}
      honbaRates={honbaRatesOf(state.config)}
      yakuDora={wall ? { ...wall, riichi: wonAfterRiichi(win) } : undefined}
    />
  );
}

export function HandReview({ state, reviewed, onBack, onOpenMatch }: {
  state: MatchState;
  reviewed: Reviewed;
  onBack: () => void;
  /** From a profile, where the match is not already on screen. */
  onOpenMatch?: () => void;
}) {
  const row = state.hands.find((h) => h.seq === reviewed.seq);
  const wins = row?.wins.filter((w) => reviewed.winner === undefined || w.winnerSeat === reviewed.winner) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="handreview" role="dialog" aria-modal="true" aria-label="Hand review">
      <div className="app">
        <header className="app__bar">
          <button type="button" className="btn btn--quiet" onClick={onBack}>Back</button>
          <h1 className="app__title">
            {row ? roundLabel({ wind: row.roundWind, number: row.roundNumber }) : 'Hand'}
            {row && row.honba > 0 && <span className="handreview__honba"> +{row.honba}</span>}
          </h1>
          <span className="app__barspacer" />
        </header>
        {row ? (
          wins.map((win) => <WinReview key={win.winnerSeat} state={state} row={row} win={win} />)
        ) : (
          <p className="home__hint">That hand is not in this match.</p>
        )}
        {onOpenMatch && (
          <button type="button" className="btn btn--wide handreview__open" onClick={onOpenMatch}>
            Open the match
          </button>
        )}
      </div>
    </div>
  );
}
