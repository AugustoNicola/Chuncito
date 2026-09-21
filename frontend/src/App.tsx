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

type Screen = 'home' | 'setup' | 'match' | 'calculator';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [restoring, setRestoring] = useState(true);

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
      />
    );
  }

  if (screen === 'calculator') {
    return <HandBuilder onCancel={() => setScreen('home')} />;
  }

  const resumable = match?.status === 'in_progress' ? match : null;

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
                    void clearMatch();
                    setMatch(null);
                  }
                  setScreen('setup');
                }}>
          {resumable ? 'Start a different match' : 'New match'}
        </button>

        <button type="button" className="btn btn--wide" onClick={() => setScreen('calculator')}>
          Hand calculator
        </button>

        {restoring && <p className="home__hint">Looking for a match in progress…</p>}
      </div>
    </div>
  );
}
