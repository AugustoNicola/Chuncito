/**
 * Which screen the app is on.
 *
 * Deliberately not a router: there are four screens and no URLs worth having
 * yet, and a match in progress is state you must not lose to a stray back
 * gesture. Phase 4 brings history and player pages, which will want real routes.
 *
 * On load the IndexedDB mirror is checked first, so a phone that died mid-hanchan
 * comes back to the table rather than to the home screen.
 */
import { useEffect, useState } from 'react';
import { HandBuilder } from './features/hand/HandBuilder';
import { MatchScreen } from './features/match/MatchScreen';
import { SetupScreen } from './features/match/SetupScreen';
import { createMatch, type MatchConfig, type MatchState } from './features/match/matchState';
import { clearMatch, loadMatch } from './features/match/persistence';
import { roundLabel } from './features/match/seats';
import { SyncPanel } from './features/match/SyncPanel';
import { PlayersScreen } from './features/players/PlayersScreen';
import {
  type ServerMatch, matchesInProgress, resumeFromServer, startSync, sync, useSyncStatus,
} from './features/match/syncClient';

type Screen = 'home' | 'setup' | 'match' | 'calculator' | 'players';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [elsewhere, setElsewhere] = useState<ServerMatch[]>([]);
  const [fetching, setFetching] = useState<string | null>(null);
  const syncState = useSyncStatus().state;

  useEffect(() => { void startSync(); }, []);

  // Matches being played on other phones, offered for carrying on here. Asked
  // again whenever home is shown or the server comes unlocked.
  useEffect(() => {
    if (screen !== 'home' || restoring) return;
    let cancelled = false;
    void matchesInProgress().then((list) => { if (!cancelled) setElsewhere(list); });
    return () => { cancelled = true; };
  }, [screen, restoring, syncState]);

  useEffect(() => {
    let cancelled = false;
    loadMatch().then((saved) => {
      if (cancelled) return;
      if (saved && saved.status === 'in_progress') {
        setMatch(saved);
        setScreen('match');
      }
      setRestoring(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (screen === 'setup') {
    return (
      <SetupScreen
        onCancel={() => setScreen('home')}
        onStart={(config: MatchConfig) => {
          setMatch(createMatch(config));
          setScreen('match');
        }}
      />
    );
  }

  if (screen === 'match' && match) {
    return (
      <MatchScreen
        match={match}
        onChange={setMatch}
        onFinished={() => { setMatch(null); setScreen('home'); }}
        onLeave={() => setScreen('home')}
        onDiscard={() => {
          void clearMatch();
          sync.discard(match.id);
          setMatch(null);
          setScreen('home');
        }}
      />
    );
  }

  if (screen === 'calculator') {
    return <HandBuilder onCancel={() => setScreen('home')} />;
  }

  if (screen === 'players') {
    return <PlayersScreen onBack={() => setScreen('home')} />;
  }

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
    setScreen('match');
  }

  return (
    <div className="app">
      <header className="app__bar app__bar--home">
        <h1 className="app__title app__title--home">Chuncito</h1>
      </header>

      <div className="home">
        {resumable && (
          <button type="button" className="btn btn--primary btn--wide home__resume"
                  onClick={() => setScreen('match')}>
            <span>Resume match</span>
            <span className="home__resumemeta">
              {roundLabel(resumable.round)} · {resumable.hands.length} hands
            </span>
          </button>
        )}

        <button type="button" className={`btn btn--wide${resumable ? '' : ' btn--primary'}`}
                onClick={() => {
                  if (resumable) {
                    // Starting a new match discards the mirror, so the old one
                    // cannot come back on the next load and confuse the table.
                    // It is thrown away, so it comes off the server as well.
                    void clearMatch();
                    sync.discard(resumable.id);
                    setMatch(null);
                  }
                  setScreen('setup');
                }}>
          {resumable ? 'Start a different match' : 'New match'}
        </button>

        <button type="button" className="btn btn--wide" onClick={() => setScreen('calculator')}>
          Hand calculator
        </button>

        <button type="button" className="btn btn--wide" onClick={() => setScreen('players')}>
          Players
        </button>

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
}
