/**
 * The table in miniature, laid out as the match screen draws it: one box per
 * side, each showing the wind and name of whoever sits there, so a choice
 * about the players is made by pointing at where they actually sit.
 *
 * Setup uses it to pick sanma's empty side; the draw menu to mark who was
 * tenpai. The callers own what a tap means; this only places the boxes.
 */
import type { ReactNode } from 'react';
import type { SituationWind } from '../../scorer/types';
import { roundKanji, type Seat, type TableSide } from './seats';

export function MiniTable({ label, note, children }: {
  label: string;
  /** Sits in the middle of the table, where the centre is on the match screen. */
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="minitable" role="group" aria-label={label}>
      {children}
      <span className="minitable__note">{note}</span>
    </div>
  );
}

/** One side of the table; `seat` undefined is sanma's empty side. */
export function MiniSide({ side, seat, wind, name, dealer = false, on = false, pressed, ariaLabel, disabled, onClick }: {
  side: TableSide;
  seat?: Seat;
  wind?: SituationWind;
  name?: string;
  dealer?: boolean;
  on?: boolean;
  pressed: boolean;
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const isEmpty = seat === undefined;
  return (
    <button type="button" data-side={side} data-seat={seat} data-dealer={dealer || undefined}
            className={`minitable__side${isEmpty ? ' minitable__side--empty' : ''}${on ? ' minitable__side--on' : ''}`}
            aria-pressed={pressed} aria-label={ariaLabel}
            disabled={disabled} onClick={onClick}>
      {isEmpty ? <span className="minitable__name">Empty</span> : (
        <>
          {wind && <span className="minitable__wind">{roundKanji(wind)}</span>}
          <span className="minitable__name">{name}</span>
        </>
      )}
    </button>
  );
}
