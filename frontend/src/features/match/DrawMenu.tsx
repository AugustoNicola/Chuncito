/**
 * Recording a hand that nobody won.
 *
 * Three shapes, which differ in what they ask for: an exhaustive draw needs to
 * know who was tenpai (it decides both the payments and whether the dealer keeps
 * the deal), a nagashi mangan needs the player as well, and an abortive draw
 * needs only a reason, which is recorded for the timeline and changes nothing.
 */
import { useState } from 'react';
import type { AbortiveReason, HandInput, MatchState } from './matchState';
import { dealerSeat, seatsIn } from './matchState';
import type { Seat } from './seats';

type Kind = 'exhaustive' | 'abortive' | 'nagashi';

/**
 * Triple ron is deliberately absent: this ruleset pays every player who wins on
 * the discard rather than aborting the hand, so three ron is recorded as a win
 * with three winners. See `WinMenu`.
 */
const ABORTIVE_REASONS: { value: AbortiveReason; label: string }[] = [
  { value: 'nine_terminals', label: 'Nine terminals' },
  { value: 'four_riichi', label: 'Four riichi' },
  { value: 'four_kans', label: 'Four kans' },
  { value: 'other', label: 'Other' },
];

export function DrawMenu({ state, onRecord, onCancel }: {
  state: MatchState;
  onRecord: (input: HandInput) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>('exhaustive');
  const [tenpai, setTenpai] = useState<Seat[]>([]);
  const [reason, setReason] = useState<AbortiveReason>('nine_terminals');
  const [nagashiSeat, setNagashiSeat] = useState<Seat | null>(null);

  const dealer = dealerSeat(state);
  const toggleTenpai = (seat: Seat) =>
    setTenpai((t) => (t.includes(seat) ? t.filter((s) => s !== seat) : [...t, seat].sort()));

  /**
   * Four riichi only aborts the hand if all four were actually declared, which
   * the tracker already knows -- so it is checked rather than taken on trust.
   */
  const fourRiichiReady = state.pendingRiichi.length === 4;
  const reasonBlocked = (value: AbortiveReason) =>
    value === 'four_riichi' && !fourRiichiReady;
  // Three players cannot put four riichi on the table, so sanma never offers it.
  const reasons = ABORTIVE_REASONS.filter(
    (opt) => opt.value !== 'four_riichi' || state.config.players === 4);

  const input: HandInput | null =
    kind === 'exhaustive' ? { kind: 'exhaustiveDraw', tenpai }
      : kind === 'abortive' ? (reasonBlocked(reason) ? null : { kind: 'abortiveDraw', reason })
        : (nagashiSeat !== null ? { kind: 'nagashiMangan', winner: nagashiSeat, tenpai } : null);

  const dealerKeeps = kind === 'abortive' || tenpai.includes(dealer);

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>Cancel</button>
        <h1 className="app__title">No winner</h1>
        <span className="app__barspacer" />
      </header>

      <div className="drawmenu">
        <div className="field">
          <span className="field__label">What happened</span>
          <div className="segmented" role="group" aria-label="What happened">
            {([
              ['exhaustive', 'Exhaustive'],
              ['nagashi', 'Nagashi'],
              ['abortive', 'Abortive'],
            ] as [Kind, string][]).map(([value, label]) => (
              <button key={value} type="button"
                      className={`segmented__btn${kind === value ? ' segmented__btn--on' : ''}`}
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {kind === 'nagashi' && (
          <div className="field">
            <span className="field__label">Whose discards</span>
            <div className="segmented" role="group" aria-label="Whose discards">
              {seatsIn(state).map((seat) => (
                <button key={seat} type="button"
                        className={`segmented__btn${nagashiSeat === seat ? ' segmented__btn--on' : ''}`}
                        aria-pressed={nagashiSeat === seat}
                        onClick={() => setNagashiSeat(nagashiSeat === seat ? null : seat)}>
                  {state.config.seats[seat]!.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === 'abortive' ? (
          <div className="field">
            <span className="field__label">Reason</span>
            <div className="stack" role="group" aria-label="Reason">
              {reasons.map((opt) => (
                <button key={opt.value} type="button"
                        className={`stack__btn${reason === opt.value ? ' stack__btn--on' : ''}`}
                        aria-pressed={reason === opt.value}
                        disabled={reasonBlocked(opt.value)}
                        onClick={() => setReason(opt.value)}>
                  {opt.label}
                  {opt.value === 'four_riichi' && !fourRiichiReady && (
                    <span className="stack__why">
                      {state.pendingRiichi.length} of 4 riichi declared — mark them
                      on the table first
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="field">
            <span className="field__label">Tenpai</span>
            <div className="checks">
              {seatsIn(state).map((seat) => (
                <button key={seat} type="button"
                        className={`check${tenpai.includes(seat) ? ' check--on' : ''}`}
                        aria-pressed={tenpai.includes(seat)}
                        onClick={() => toggleTenpai(seat)}>
                  {state.config.seats[seat]!.name}
                  {seat === dealer && <span className="check__tag">dealer</span>}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="app__spacer" />

      {/* Pinned to the bottom, so the way on is always in sight -- even disabled. */}
      <div className="app__footer">
        <div className="status">
          {dealerKeeps ? 'The dealer keeps the deal.' : 'The deal passes on.'}
          {' Honba goes to '}{state.honba + 1}
          {state.potCarried + state.pendingRiichi.length > 0 && '; the sticks stay on the table'}.
        </div>

        <button type="button" className="btn btn--primary btn--wide"
                disabled={input === null}
                onClick={() => input && onRecord(input)}>
          Review
        </button>
      </div>
    </div>
  );
}
