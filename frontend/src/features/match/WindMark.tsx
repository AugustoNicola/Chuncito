/**
 * A seat's wind as a small circled kanji, like the setup screen's seat marks,
 * with the word in the tooltip. East -- the dealer's wind -- takes the dealer
 * accent, as it does on the table.
 */
import type { SituationWind } from '../../scorer/types';
import { roundKanji, roundName } from './seats';

export function WindMark({ wind }: { wind: SituationWind }) {
  return (
    <span className="windmark" data-wind={wind} title={roundName(wind)} aria-label={roundName(wind)}>
      {roundKanji(wind)}
    </span>
  );
}
