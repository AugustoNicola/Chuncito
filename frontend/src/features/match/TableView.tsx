/**
 * The table: a player box per seat around a centre box, as seen from above.
 * In sanma the fourth chair -- the one that would start North -- stays empty.
 *
 * Seat 0 sits at the bottom and the others run clockwise around the screen,
 * which puts the player to your right on the right -- the same arrangement every
 * online client uses, and the same one the physical table has. The boxes for the
 * facing and side players are rotated so their text faces their seat, so the
 * phone can be laid flat in the middle and still read correctly from any chair.
 */
import type { MatchState } from './matchState';
import { dealerSeat, potOnTable, seatsIn } from './matchState';
import type { Seat } from './seats';
import { roundKanji, roundLabel, roundName, seatWindOf } from './seats';

const SEAT_POSITION: Record<Seat, string> = {
  0: 'bottom', 1: 'right', 2: 'top', 3: 'left',
};

function PlayerBox({ state, seat, onOpen, onRiichi }: {
  state: MatchState;
  seat: Seat;
  onOpen: (seat: Seat) => void;
  onRiichi: (seat: Seat) => void;
}) {
  const player = state.config.seats[seat]!;
  const wind = seatWindOf(seat, state.round, state.config.players);
  const isDealer = seat === dealerSeat(state);
  const declared = state.pendingRiichi.includes(seat);
  const score = state.scores[seat];
  const live = state.status === 'in_progress';

  return (
    <div className={`seat seat--${SEAT_POSITION[seat]}`} data-seat={seat}>
      <div className={`playerbox${isDealer ? ' playerbox--dealer' : ''}${declared ? ' playerbox--riichi' : ''}`}>
        <button type="button" className="playerbox__main"
                disabled={!live}
                onClick={() => onOpen(seat)}
                aria-label={`Record a win for ${player.name}`}>
          <span className="playerbox__wind" aria-hidden="true">{roundKanji(wind)}</span>
          <span className="playerbox__name">
            {player.name}
            {/* The kanji alone is quick to read once you know it; the word is
                for everyone else at the table. */}
            <span className="playerbox__windname">{roundName(wind)}</span>
          </span>
          <span className={`playerbox__score${score < 0 ? ' playerbox__score--negative' : ''}`}>
            {score.toLocaleString()}
          </span>
        </button>
        <button type="button"
                className={`playerbox__riichi${declared ? ' playerbox__riichi--on' : ''}`}
                aria-pressed={declared}
                disabled={!live}
                onClick={() => onRiichi(seat)}
                title={declared ? 'Take the riichi back' : 'Declare riichi'}>
          <span className="playerbox__stick" />
          <span className="playerbox__riichilabel">Riichi</span>
        </button>
      </div>
    </div>
  );
}

export function TableView({ state, onOpenSeat, onRiichi, onOpenCentre }: {
  state: MatchState;
  onOpenSeat: (seat: Seat) => void;
  onRiichi: (seat: Seat) => void;
  onOpenCentre: () => void;
}) {
  const pot = potOnTable(state);

  return (
    <div className="table">
      {seatsIn(state).map((seat) => (
        <PlayerBox key={seat} state={state} seat={seat}
                   onOpen={onOpenSeat} onRiichi={onRiichi} />
      ))}

      <button type="button" className="centre"
              disabled={state.status !== 'in_progress'}
              onClick={onOpenCentre}
              aria-label="Record a draw">
        <span className="centre__brand">
          {/* Stands in for the red dragon logo; the tile glyph is masked rather
              than drawn, so it takes the app's colour instead of its own. */}
          <span className="centre__logo" aria-hidden="true" />
          Chuncito
        </span>
        <span className="centre__round">{roundLabel(state.round)}</span>
        <div className="centre__counters">
          <span className="centre__counter">
            <span className="centre__countername">Riichi</span>
            <span className="centre__countervalue">{pot}</span>
          </span>
          <span className="centre__counter">
            <span className="centre__countername">Honba</span>
            <span className="centre__countervalue">{state.honba}</span>
          </span>
        </div>
      </button>
    </div>
  );
}
