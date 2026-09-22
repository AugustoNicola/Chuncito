/**
 * Finished matches, newest first, narrowed by the filters in the URL.
 *
 * The filters are the URL's query string rather than component state, so Back
 * from a match review comes back to the same list, and a reload keeps it.
 * Typing replaces the history entry rather than adding one per keystroke.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { levelName, levelTier } from '../hand/yakuNames';
import { PinForm } from '../match/SyncPanel';
import { placeLabel } from '../match/scoring';
import { type ServerMatch, refreshPlayers } from '../match/syncClient';
import { type Player, byRecent, cachedPlayers } from '../players/players';
import {
  type Fetched, type HistoryFilters, LEVELS, NO_FILTERS, YAKU_CHOICES, fetchHistory,
  filtersFrom, isFiltered, paramsOf,
} from './history';

/** Long enough that typing a name is one request, short enough to feel live. */
const TYPING_MS = 250;

export const matchDate = (iso: string): string => new Date(iso).toLocaleDateString(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});

export function MatchList({ onBack }: { onBack: () => void }) {
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const [result, setResult] = useState<Fetched<ServerMatch[]> | null>(null);
  const [players, setPlayers] = useState<Player[]>(() => byRecent(cachedPlayers()));
  const [reload, setReload] = useState(0);
  const key = paramsOf(filters).toString();

  useEffect(() => { void refreshPlayers().then((fresh) => { if (fresh) setPlayers(byRecent(fresh)); }); }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchHistory(filtersFrom(new URLSearchParams(key))).then((r) => {
        if (!cancelled) setResult(r);
      });
    }, filters.text ? TYPING_MS : 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // `filters.text` only decides the delay; `key` already carries it.
  }, [key, reload]);

  const change = (next: Partial<HistoryFilters>, opts: { typing?: boolean } = {}) =>
    setParams(paramsOf({ ...filters, ...next }), { replace: opts.typing ?? false });

  const togglePlayer = (id: string) => change({
    playerIds: filters.playerIds.includes(id)
      ? filters.playerIds.filter((p) => p !== id)
      : [...filters.playerIds, id],
  });

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onBack}>Back</button>
        <h1 className="app__title">History</h1>
        <span className="app__barspacer" />
      </header>

      <section className="history__filters" aria-label="Filters">
        <input className="history__search" type="search" value={filters.text}
               placeholder="Search by match or player name" aria-label="Search"
               onChange={(e) => change({ text: e.target.value }, { typing: true })} />

        {players.length > 0 && (
          <div className="history__chips" role="group" aria-label="Played by">
            {players.map((p) => (
              <button key={p.id} type="button"
                      className={`chip${filters.playerIds.includes(p.id) ? ' chip--on' : ''}`}
                      aria-pressed={filters.playerIds.includes(p.id)}
                      onClick={() => togglePlayer(p.id)}>
                {p.displayName}
              </button>
            ))}
          </div>
        )}

        <div className="segmented" role="group" aria-label="Players at the table">
          {([[null, 'All'], [4, 'Four'], [3, 'Sanma']] as const).map(([n, label]) => (
            <button key={label} type="button"
                    className={`segmented__btn${filters.players === n ? ' segmented__btn--on' : ''}`}
                    onClick={() => change({ players: n })}>
              {label}
            </button>
          ))}
        </div>

        <div className="history__selects">
          <select className="history__select" aria-label="Best hand"
                  value={filters.minLevel ?? ''}
                  onChange={(e) => change({ minLevel: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Any best hand</option>
            {LEVELS.map((l) => <option key={l.rank} value={l.rank}>{l.label}</option>)}
          </select>
          <select className="history__select" aria-label="Yaku"
                  value={filters.yaku ?? ''}
                  onChange={(e) => change({ yaku: e.target.value || null })}>
            <option value="">Any yaku</option>
            {YAKU_CHOICES.map((y) => <option key={y.atom} value={y.atom}>{y.name}</option>)}
          </select>
        </div>

        {isFiltered(filters) && (
          <button type="button" className="btn btn--quiet history__clear"
                  onClick={() => setParams(paramsOf(NO_FILTERS))}>
            Clear filters
          </button>
        )}
      </section>

      <Results result={result} filtered={isFiltered(filters)}
               onUnlocked={() => setReload((n) => n + 1)} />
    </div>
  );
}

function Results({ result, filtered, onUnlocked }: {
  result: Fetched<ServerMatch[]> | null; filtered: boolean; onUnlocked: () => void;
}) {
  if (result === null) return <p className="home__hint">Loading…</p>;
  switch (result.kind) {
    case 'locked':
      return <PinForm reason="The history is kept on the server. Enter the group's PIN to see it."
                      onUnlocked={onUnlocked} />;
    case 'unreachable':
    case 'missing':
      return <p className="home__hint">The server cannot be reached, and the history is kept there.</p>;
    case 'ok':
      if (result.value.length === 0) {
        return <p className="home__hint">
          {filtered ? 'No finished match fits these filters.' : 'No finished matches yet.'}
        </p>;
      }
      return (
        <ol className="history__list">
          {result.value.map((m) => <li key={m.id}><MatchItem match={m} /></li>)}
        </ol>
      );
  }
}

function MatchItem({ match }: { match: ServerMatch }) {
  const order = match.seats.map((name, seat) => ({
    name, score: match.scores[seat] ?? 0, place: match.placements[seat] ?? seat + 1,
  })).sort((a, b) => a.place - b.place);
  const level = match.maxLevel && match.maxLevel !== 'sinNombre' ? match.maxLevel : null;

  return (
    <Link className="history__item" to={`/matches/${encodeURIComponent(match.id)}`}
          data-tier={level ? levelTier(level) : undefined}>
      <span className="history__top">
        <span className="history__name">{match.name || 'Unnamed match'}</span>
        {level && <span className="history__level">{levelName(level)}</span>}
      </span>
      <span className="history__meta">
        {matchDate(match.startedAt)}
        {match.players === 3 && ' · Sanma'}
        {` · ${match.hands} hand${match.hands === 1 ? '' : 's'}`}
      </span>
      <span className="history__standings">
        {order.map((p) => (
          <span key={p.place} className="history__seat" data-place={p.place}>
            <span className="history__place">{placeLabel(p.place)}</span>
            {' '}{p.name} <span className="history__score">{p.score.toLocaleString()}</span>
          </span>
        ))}
      </span>
    </Link>
  );
}
