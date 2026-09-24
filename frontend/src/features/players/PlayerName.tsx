/**
 * A seated player's name, as a link to their page when that is safe to follow.
 *
 * Only registered players have a page; a guest's name stays plain text. And
 * only outside a match in progress: the table blocks navigation (see
 * `MatchScreen`), so a link there would be a dead end -- callers inside a match
 * pass `link={false}`.
 */
import { Link } from 'react-router-dom';
import type { SeatPlayer } from '../match/matchState';
import { slugOf } from './players';

export function PlayerName({ seat, link }: { seat: SeatPlayer; link: boolean }) {
  if (!link || seat.playerId === null) return <>{seat.name}</>;
  // The server's slug is `slugify(display_name)`, which `slugOf` mirrors.
  return (
    <Link className="playerlink" to={`/players/${encodeURIComponent(slugOf(seat.name))}`}>
      {seat.name}
    </Link>
  );
}
