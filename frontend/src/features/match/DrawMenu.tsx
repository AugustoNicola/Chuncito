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
import { dealerSeat } from './matchState';
import { drawDelta, nagashiDelta } from './scoring';
import type { Seat } from './seats';
import { SEATS } from './seats';

type Kind = 'exhaustive' | 'abortive' | 'nagashi';

const ABORTIVE_REASONS: { value: AbortiveReason; label: string }[] = [
  { value: 'nine_terminals', label: 'Nine terminals' },
  { value: 'four_riichi', label: 'Four riichi' },
  { value: 'four_kans', label: 'Four kans' },
  { value: 'triple_ron', label: 'Triple ron' },
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

  const input: HandInput | null =
    kind === 'exhaustive' ? { kind: 'exhaustiveDraw', tenpai }
      : kind === 'abortive' ? { kind: 'abortiveDraw', reason }
        : (nagashiSeat !== null ? { kind: 'nagashiMangan', winner: nagashiSeat, tenpai } : null);

  // Shown before committing, because a noten penalty is the kind of thing
  // people want to check against the sticks actually moving on the table.
  const preview = input === null ? null
    : input.kind === 'nagashiMangan'
      ? nagashiDelta({ winner: input.winner, dealer, honba: state.honba, riichiSeats: [] })
      : input.kind === 'exhaustiveDraw' ? drawDelta(input.tenpai, []) : null;

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
              {SEATS.map((seat) => (
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
            <div className="pills" role="group" aria-label="Reason">
              {ABORTIVE_REASONS.map((opt) => (
                <button key={opt.value} type="button"
                        className={`pill${reason === opt.value ? ' pill--on' : ''}`}
                        aria-pressed={reason === opt.value}
                        onClick={() => setReason(opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="field">
            <span className="field__label">Tenpai</span>
            <div className="checks">
              {SEATS.map((seat) => (
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

        {preview && (
          <div className="field">
            <span className="field__label">Points</span>
            <div className="drawmenu__preview">
              {SEATS.map((seat) => (
                <span key={seat} className="drawmenu__row">
                  <span>{state.config.seats[seat]!.name}</span>
                  <span className={preview[seat] < 0 ? 'drawmenu__loss' : 'drawmenu__gain'}>
                    {preview[seat] > 0 ? '+' : ''}{preview[seat].toLocaleString()}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="app__spacer" />

      <div className="status">
        {dealerKeeps ? 'The dealer keeps the deal.' : 'The deal passes on.'}
        {' Honba goes to '}{state.honba + 1}
        {state.potCarried + state.pendingRiichi.length > 0 && '; the sticks stay on the table'}.
      </div>

      <button type="button" className="btn btn--primary btn--wide"
              disabled={input === null}
              onClick={() => input && onRecord(input)}>
        Record
      </button>
    </div>
  );
}
