/**
 * A Tiktok match's yaku wall on screen: a strip under the table, as the dead
 * wall sits beside it, and a screen of its own to reveal the next yaku from.
 *
 * Revealing is not on the strip itself. A kan is rare and a stray tap on the
 * table is not, and a yaku turned over cannot be un-seen by anyone at the
 * table -- so the strip only opens the wall, and the reveal is a deliberate
 * button there (with a way to put back one tapped by mistake).
 */
import { yakuName } from '../hand/yakuNames';
import { WALL_SIZE, type YakuWall } from './yakuWall';

export function YakuWallStrip({ wall, onOpen }: { wall: YakuWall; onOpen: () => void }) {
  return (
    <button type="button" className="yakuwall" onClick={onOpen}
            aria-label={`Yaku dora: ${wall.dora.slice(0, wall.revealed).map(yakuName).join(', ')}. Open the wall`}>
      <span className="yakuwall__label">Yaku dora</span>
      <span className="yakuwall__cards">
        {wall.dora.map((yaku, i) => (i < wall.revealed
          ? <span key={i} className="yakuwall__card yakuwall__card--up">{yakuName(yaku)}</span>
          : <span key={i} className="yakuwall__card yakuwall__card--down" aria-hidden="true" />))}
      </span>
    </button>
  );
}

export function YakuWallScreen({ wall, onReveal, onHide, onClose }: {
  wall: YakuWall;
  onReveal: () => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const full = wall.revealed >= WALL_SIZE;
  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose}>Back</button>
        <h1 className="app__title">Yaku wall</h1>
        <span className="app__barspacer" />
      </header>

      <div className="wallscreen">
        <ol className="wallscreen__list">
          {wall.dora.map((yaku, i) => (
            <li key={i} className={`wallscreen__slot${i < wall.revealed ? ' wallscreen__slot--up' : ''}`}>
              <span className="wallscreen__n">{i + 1}</span>
              {i < wall.revealed
                ? <span className="wallscreen__name">{yakuName(yaku)}</span>
                : <span className="wallscreen__hidden">{i === wall.revealed ? 'Next kan' : 'Face down'}</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="app__spacer" />

      <div className="app__footer">
        {wall.revealed > 1 && (
          <button type="button" className="btn btn--wide" onClick={onHide}>
            Turn the last one back over
          </button>
        )}
        <button type="button" className="btn btn--primary btn--wide" disabled={full} onClick={onReveal}>
          {full ? 'All five are revealed' : 'A kan: reveal the next yaku'}
        </button>
      </div>
    </div>
  );
}
