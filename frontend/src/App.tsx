/**
 * The routes, and the match in progress that they share.
 *
 * | path          | screen |
 * |---|---|
 * | `/`           | home |
 * | `/setup`      | a new match |
 * | `/match`      | the table, for the match in progress on this phone |
 * | `/calculator` | the hand calculator on its own |
 * | `/players`    | adding and renaming players |
 * | `/players/:slug` | a player's stats; `?players=3` for sanma |
 * | `/matches`    | finished matches; the filters are the query string |
 * | `/matches/:id`| one finished match, read back |
 *
 * The match lives here rather than in a route, since home, setup and the table
 * all need it. `/match` without one goes home. A back gesture cannot leave the
 * table; `MatchScreen` guards that itself.
 *
 * On load the IndexedDB mirror is checked first, so a phone that died mid-hanchan
 * comes back to the table rather than to the home screen.
 */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { HandBuilder } from './features/hand/HandBuilder';
import { MatchScreen } from './features/match/MatchScreen';
import { SetupScreen } from './features/match/SetupScreen';
import { createMatch, type MatchConfig, type MatchState } from './features/match/matchState';
import { clearMatch, loadMatch } from './features/match/persistence';
import { roundLabel } from './features/match/seats';
import { SyncPanel } from './features/match/SyncPanel';
import { PlayersScreen } from './features/players/PlayersScreen';
import { ProfileScreen } from './features/players/ProfileScreen';
import { MatchList } from './features/history/MatchList';
import { MatchReview } from './features/history/MatchReview';
import {
  type ServerMatch, matchesInProgress, resumeFromServer, startSync, sync, useSyncStatus,
} from './features/match/syncClient';

export function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [match, setMatch] = useState<MatchState | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [elsewhere, setElsewhere] = useState<ServerMatch[]>([]);
  const [fetching, setFetching] = useState<string | null>(null);
  const syncState = useSyncStatus().state;
  const atHome = pathname === '/';
  // Where the app was opened, before any redirect: the restore below reads the
  // mirror asynchronously, by which time `/no/such/page` has become `/`.
  const [openedAt] = useState(() => window.location.pathname);

  /**
   * A screen's own Back button: back through the history when there is an
   * in-app entry to go back to, so a Back tap and a back gesture agree, and
   * its parent otherwise (a screen opened from a link has nothing behind it).
   * `idx` is React Router's own position in the history stack.
   */
  const back = (parent = '/') => () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
    else navigate(parent, { replace: true });
  };
  // Out of the match. Replacing the entry rather than going back, since the
  // table must not be one back gesture away once it is left.
  const leaveMatch = () => navigate('/', { replace: true });

  useEffect(() => { void startSync(); }, []);

  // Matches being played on other phones, offered for carrying on here. Asked
  // again whenever home is shown or the server comes unlocked.
  useEffect(() => {
    if (!atHome || restoring) return;
    let cancelled = false;
    void matchesInProgress().then((list) => { if (!cancelled) setElsewhere(list); });
    return () => { cancelled = true; };
  }, [atHome, restoring, syncState]);

  useEffect(() => {
    let cancelled = false;
    loadMatch().then((saved) => {
      if (cancelled) return;
      if (saved && saved.status === 'in_progress') {
        setMatch(saved);
        // Only from home: a link to somewhere else is followed, and home
        // offers the match back.
        if (openedAt === '/') navigate('/match', { replace: true });
      }
      setRestoring(false);
    });
    return () => { cancelled = true; };
  }, []);

  const resumable = match?.status === 'in_progress' ? match : null;
  // Only when this phone has no match of its own on the go: carrying on another
  // one would replace it, and that choice deserves more than a list item.
  const others = resumable ? [] : elsewhere;

  async function carryOn(id: string) {
    setFetching(id);
    const state = await resumeFromServer(id);
    setFetching(null);
    if (!state) return;
    setMatch(state);
    navigate('/match');
  }

  const home = (
    <div className="app">
      <header className="app__bar app__bar--home">
        <h1 className="app__title app__title--home">
          {/* The centre box's wordmark, so the app is branded one way. */}
          <span className="brand__logo" aria-hidden="true" />
          Chuncito
        </h1>
      </header>

      <div className="home">
        {resumable && (
          <button type="button" className="btn btn--primary btn--wide home__resume"
                  onClick={() => navigate('/match')}>
            <span>Resume match</span>
            <span className="home__resumemeta">
              {roundLabel(resumable.round)} · {resumable.hands.length} hands
            </span>
          </button>
        )}

        <nav className="home__grid" aria-label="Chuncito">
          <HomeCard label={resumable ? 'Start a different match' : 'New match'} art="new"
                    onClick={() => {
                      if (resumable) {
                        // Starting a new match discards the mirror, so the old one
                        // cannot come back on the next load and confuse the table.
                        // It is thrown away, so it comes off the server as well.
                        void clearMatch();
                        sync.discard(resumable.id);
                        setMatch(null);
                      }
                      navigate('/setup');
                    }} />
          <HomeCard label="Hand calculator" art="calculator" onClick={() => navigate('/calculator')} />
          <HomeCard label="History" art="history" onClick={() => navigate('/matches')} />
          <HomeCard label="Players" art="players" onClick={() => navigate('/players')} />
        </nav>

        {restoring && <p className="home__hint">Looking for a match in progress…</p>}

        {others.length > 0 && (
          <section className="home__elsewhere">
            <h2 className="home__heading">In progress on another device</h2>
            {others.map((m) => (
              <button key={m.id} type="button" className="btn btn--wide home__resume"
                      disabled={fetching !== null}
                      onClick={() => void carryOn(m.id)}>
                <span>{m.seats.join(', ')}</span>
                <span className="home__resumemeta">
                  {fetching === m.id ? 'Fetching…' : (
                    `${m.players === 3 ? 'Sanma · ' : ''}${m.hands} hand${m.hands === 1 ? '' : 's'}`
                    + ` · started ${new Date(m.startedAt).toLocaleString(undefined, {
                      weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
                  )}
                </span>
              </button>
            ))}
            <p className="home__hint">
              Carrying one on here moves it to this phone. If the other phone records
              a hand too, whichever saves second is asked which copy to keep.
            </p>
          </section>
        )}

        <SyncPanel />
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/setup" element={
        <SetupScreen
          onCancel={back()}
          onStart={(config: MatchConfig) => {
            setMatch(createMatch(config));
            // Setup is done with: Back from the table must not return to it.
            navigate('/match', { replace: true });
          }}
        />
      } />
      <Route path="/match" element={
        match ? (
          <MatchScreen
            match={match}
            onChange={setMatch}
            onFinished={() => { setMatch(null); leaveMatch(); }}
            onLeave={leaveMatch}
            onDiscard={() => {
              void clearMatch();
              sync.discard(match.id);
              setMatch(null);
              leaveMatch();
            }}
          />
        ) : restoring ? null : <Navigate to="/" replace />
      } />
      <Route path="/calculator" element={<HandBuilder onCancel={back()} />} />
      <Route path="/players" element={<PlayersScreen onBack={back()} />} />
      <Route path="/players/:slug" element={<ProfileScreen onBack={back('/players')} />} />
      <Route path="/matches" element={<MatchList onBack={back()} />} />
      <Route path="/matches/:id" element={<MatchReview onBack={back('/matches')} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * The home screen's four ways in, each a tall card with tile glyphs for art.
 * The glyphs are masks painted in one colour, the same trick as the logo, so
 * they read as the app's own marks rather than as tiles to be played.
 * Experimental: the old version was four wide buttons.
 */
const ART: Record<string, readonly string[]> = {
  new: ['r'],
  // Drawn for this card: the pins' white details, which a plain mask of the
  // playing tiles' glyphs would fill in as solid discs.
  calculator: ['white/p1', 'white/p2', 'white/p3'],
  history: ['m3'],
  // East, South / West, North: the corners of the card, as seats round a table.
  players: ['e', 's', 'w', 'n'],
};

function HomeCard({ label, art, onClick }: { label: string; art: string; onClick: () => void }) {
  return (
    <button type="button" className="home__card" onClick={onClick}>
      <span className="home__art" data-art={art} aria-hidden="true">
        {ART[art]!.map((tile) => (
          <span key={tile} className="home__tile">
            <span className="home__glyph"
                  style={{ maskImage: `url(/tiles/${tile}.svg)`, WebkitMaskImage: `url(/tiles/${tile}.svg)` }} />
          </span>
        ))}
      </span>
      <span className="home__cardlabel">{label}</span>
    </button>
  );
}
