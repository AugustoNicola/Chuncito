/**
 * A player's page: how they place, how they win, what they win with.
 *
 * One kind of match at a time -- four-player or sanma, toggled, and kept in
 * the URL (`?players=3`) so Back and a reload keep the choice. Opened with no
 * choice made, on a player with only sanma behind them, it shows sanma rather
 * than an empty four-player page; a choice, once made, is always written out
 * (`?players=4` too), so that redirect cannot undo it.
 *
 * Guest seats never count (a guest is not a player), and only finished matches
 * do: the server applies both.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HandSummary } from '../hand/HandDisplay';
import { decodeHandTiles } from '../hand/handTiles';
import { levelName, levelTier } from '../hand/yakuNames';
import type { Fetched } from '../history/history';
import { matchDate } from '../history/MatchList';
import { PinForm } from '../match/SyncPanel';
import { type Round, roundLabel } from '../match/seats';
import { Bars, Donut, PlacementLine } from './charts';
import {
  type PlayerStats, averagePlacement, fetchStats, percent, placementSlices, winMethodSlices,
  yakuRows,
} from './profile';

const PLACE_COLOR = (key: string) => `var(--viz-place-${key.slice(1)})`;
const METHOD_COLOR: Record<string, string> = {
  riichi: 'var(--viz-series-1)', dama: 'var(--viz-series-2)', open: 'var(--viz-series-3)',
  unknown: 'var(--viz-unknown)',
};

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const asked = params.get('players');
  const players: 3 | 4 = asked === '3' ? 3 : 4;
  const [result, setResult] = useState<Fetched<PlayerStats> | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchStats(slug, players).then((r) => {
      if (cancelled) return;
      // Nothing to show here but something in the other kind: go there instead.
      if (r.kind === 'ok' && asked === null && r.value.matchesFour === 0 && r.value.matchesSanma > 0) {
        setParams({ players: '3' }, { replace: true });
        return;
      }
      setResult(r);
    });
    return () => { cancelled = true; };
  }, [slug, players, asked, reload, setParams]);

  const stats = result?.kind === 'ok' && result.value.players === players ? result.value : null;

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onBack}>Back</button>
        <h1 className="app__title review__title">{stats?.player.displayName ?? 'Player'}</h1>
        <span className="app__barspacer" />
      </header>

      {result === null && <p className="home__hint">Loading…</p>}
      {result?.kind === 'locked' && (
        <PinForm reason="Stats are worked out on the server. Enter the group's PIN to see them."
                 onUnlocked={() => setReload((n) => n + 1)} />
      )}
      {result?.kind === 'missing' && <p className="home__hint">There is no such player.</p>}
      {result?.kind === 'unreachable' && (
        <p className="home__hint">The server cannot be reached, and the stats are worked out there.</p>
      )}

      {stats && (
        <div className="profile">
          <div className="segmented" role="group" aria-label="Kind of match">
            {([[4, 'Four players', stats.matchesFour], [3, 'Sanma', stats.matchesSanma]] as const)
              .map(([n, label, count]) => (
                <button key={n} type="button"
                        className={`segmented__btn${players === n ? ' segmented__btn--on' : ''}`}
                        onClick={() => setParams({ players: String(n) }, { replace: true })}>
                  {label} <span className="profile__count">{count}</span>
                </button>
              ))}
          </div>

          {stats.matches.length === 0
            ? <p className="home__hint">No finished {players === 3 ? 'sanma ' : ''}matches yet.</p>
            : <Profile stats={stats} onOpen={(id) => navigate(`/matches/${encodeURIComponent(id)}`)} />}
        </div>
      )}
    </div>
  );
}

function Profile({ stats, onOpen }: { stats: PlayerStats; onOpen: (matchId: string) => void }) {
  const avg = averagePlacement(stats.placementCounts);
  const yakus = yakuRows(stats.yakus);
  const best = stats.bestHand;
  const sanma = stats.players === 3;

  return (
    <>
      {/* The match count is on the toggle above, so the tiles make an even 3 x 2. */}
      <div className="stats">
        <Stat label="Average place" value={avg === null ? '–' : avg.toFixed(2)} />
        <Stat label="Uma" value={`${stats.umaTotal > 0 ? '+' : ''}${stats.umaTotal}`} />
        <Stat label="Win rate" value={percent(stats.wins, stats.hands)}
              detail={`${stats.wins} of ${stats.hands} hands`} />
        <Stat label="Tsumo rate" value={percent(stats.tsumoWins, stats.wins)}
              detail={`${stats.tsumoWins} of ${stats.wins} wins`} />
        <Stat label="Deal-in rate" value={percent(stats.dealIns, stats.hands)}
              detail={`${stats.dealIns} of ${stats.hands} hands`} />
        <Stat label="Riichi rate" value={percent(stats.riichis, stats.hands)}
              detail={`${stats.riichis} of ${stats.hands} hands`} />
      </div>

      <section className="profile__section">
        <h2 className="home__heading">Placements</h2>
        <PlacementLine matches={stats.matches} players={stats.players} onOpen={onOpen} />
        <Donut slices={placementSlices(stats.placementCounts)} colorOf={PLACE_COLOR}
               caption="matches" unit={(n) => `${n} match${n === 1 ? '' : 'es'}`} />
      </section>

      {best && (
        <section className="profile__section">
          <h2 className="home__heading">Best hand</h2>
          <div className="endscreen__best" data-tier={best.level ? levelTier(best.level) : 'none'}>
            <span className="endscreen__bestvalue">
              {!best.level || best.level === 'sinNombre'
                ? `${best.han ?? '?'} han${best.fu ? ` · ${best.fu} fu` : ''}`
                : levelName(best.level)}
            </span>
            <span className="endscreen__bestwho">
              {best.matchName || 'Unnamed match'}
              {' · '}{roundLabel({ wind: best.roundWind, number: best.roundNumber } as Round)}
              {best.pointsWon !== null && ` · ${best.pointsWon.toLocaleString()}`}
            </span>
            {best.handTiles && <HandSummary state={decodeHandTiles(best.handTiles, sanma)} />}
          </div>
          <button type="button" className="btn btn--quiet profile__open"
                  onClick={() => onOpen(best.matchId)}>
            See that match
          </button>
        </section>
      )}

      <section className="profile__section">
        <h2 className="home__heading">How they win</h2>
        {stats.wins === 0
          ? <p className="home__hint">No hands won yet.</p>
          : <Donut slices={winMethodSlices(stats.winMethods)} colorOf={(k) => METHOD_COLOR[k]!}
                   caption="wins" unit={(n) => `${n} win${n === 1 ? '' : 's'}`} />}
      </section>

      {yakus.length > 0 && (
        <section className="profile__section">
          <h2 className="home__heading">Yaku won with</h2>
          <Bars rows={yakus.map((y) => ({ key: y.yaku, name: y.name, count: y.count }))} limit={8} />
        </section>
      )}

      <section className="profile__section">
        <details className="profile__table">
          <summary>Every match, as a list</summary>
          <ol className="profile__matches">
            {[...stats.matches].reverse().map((m) => (
              <li key={m.matchId}>
                <button type="button" className="profile__match" onClick={() => onOpen(m.matchId)}>
                  <span className="profile__matchplace" data-place={m.placement}>
                    {['1st', '2nd', '3rd', '4th'][m.placement - 1]}
                  </span>
                  <span className="profile__matchname">{m.name || 'Unnamed match'}</span>
                  <span className="profile__matchdate">{matchDate(m.startedAt)}</span>
                  <span className="profile__matchscore">{m.finalScore.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {detail && <span className="stat__detail">{detail}</span>}
    </div>
  );
}
