/**
 * The Players screen: where people are added to the group, on purpose.
 *
 * The other place a player is created is setup's explicit "Add … as a new
 * player" option; neither lets a typo invent one by accident. Each name opens that player's stats
 * (`ProfileScreen`); a profile's extras (a tile avatar, an accent colour) are
 * still to come.
 *
 * Needs the server, since the list is the group's rather than the phone's.
 * Offline it shows the cached list and says why it cannot add to it.
 */
import { useEffect, useState } from 'react';
import { PinForm } from '../match/SyncPanel';
import {
  createPlayer, refreshPlayers, renamePlayer, sessionLocked, useSyncStatus,
} from '../match/syncClient';
import { Link } from 'react-router-dom';
import { type Player, byMakapoints, cachedPlayers, slugOf } from './players';
import { resultLabel } from '../match/scoring';

type Reach = 'checking' | 'online' | 'unreachable';

export function PlayersScreen({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<Player[]>(() => cachedPlayers());
  const [reach, setReach] = useState<Reach>('checking');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const syncState = useSyncStatus().state;
  const [locked, setLocked] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void refreshPlayers().then(async (fresh) => {
      if (cancelled) return;
      if (fresh) { setList(fresh); setReach('online'); setLocked(false); return; }
      const needsPin = await sessionLocked();
      if (cancelled) return;
      setLocked(needsPin);
      setReach(needsPin ? 'online' : 'unreachable');
    });
    return () => { cancelled = true; };
    // Asked again once the PIN is in, and whenever the server's answer may change.
  }, [syncState, reload]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const result = await createPlayer(trimmed);
    setBusy(false);
    if (result.ok) {
      setName('');
      setList(cachedPlayers());
      setMessage({ text: `${result.player.displayName} added.`, bad: false });
    } else {
      setLocked(Boolean(result.locked));
      setMessage({ text: result.message, bad: true });
    }
  }

  async function saveRename() {
    if (!editing || busy) return;
    const trimmed = editing.name.trim();
    const current = list.find((p) => p.id === editing.id);
    if (!trimmed || trimmed === current?.displayName) { setEditing(null); return; }
    setBusy(true);
    const result = await renamePlayer(editing.id, trimmed);
    setBusy(false);
    if (result.ok) {
      setEditing(null);
      setList(cachedPlayers());
      setMessage({ text: `Renamed to ${result.player.displayName}.`, bad: false });
    } else {
      setLocked(Boolean(result.locked));
      setMessage({ text: result.message, bad: true });
    }
  }

  const offline = reach === 'unreachable' && !locked;

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onBack}>Back</button>
        <h1 className="app__title">Players</h1>
        <span className="app__barspacer" />
      </header>

      <div className="players">
        {locked && (
          <section className="sync" data-state="locked">
            <PinForm reason="The player list is the group's, on the server. Enter the group's PIN."
                     onUnlocked={() => { setLocked(false); setReload((n) => n + 1); }} />
          </section>
        )}

        <form className="players__add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input className="players__input" value={name} maxLength={60}
                 placeholder="New player's name" aria-label="New player's name"
                 onChange={(e) => { setName(e.target.value); setMessage(null); }} />
          <button type="submit" className="btn btn--primary" disabled={!name.trim() || busy}>
            Add
          </button>
        </form>
        {message && (
          <p className={message.bad ? 'players__message players__message--bad' : 'players__message'}>
            {message.text}
          </p>
        )}
        {offline && (
          <p className="players__message">
            The server cannot be reached, so players cannot be added or renamed right now.
            The list below is as of the last time it could.
          </p>
        )}

        {list.length === 0 ? (
          <p className="home__hint">
            {reach === 'checking' ? 'Loading…' : 'No players yet. Add the group above.'}
          </p>
        ) : (
          <ul className="players__list">
            {byMakapoints(list).map(({ player: p, rank }) => (
              <li key={p.id} className="players__row" data-rank={rank ?? undefined}>
                {editing?.id === p.id ? (
                  <form className="players__edit"
                        onSubmit={(e) => { e.preventDefault(); void saveRename(); }}>
                    <input className="players__input" value={editing.name} maxLength={60}
                           autoFocus aria-label={`New name for ${p.displayName}`}
                           onChange={(e) => setEditing({ id: p.id, name: e.target.value })} />
                    <button type="submit" className="btn btn--primary" disabled={busy}>Save</button>
                    <button type="button" className="btn btn--quiet"
                            onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <Link className="players__card" to={`/players/${slugOf(p.displayName)}`}>
                      <span className="players__rank" aria-label={rank ? `Rank ${rank}` : 'Unranked'}>
                        {rank ?? '–'}
                      </span>
                      <span className="players__who">
                        <span className="players__name">{p.displayName}</span>
                        <span className="players__played">
                          {(p.mpMatches ?? 0) > 0
                            ? `${p.mpMatches} ranked match${p.mpMatches === 1 ? '' : 'es'}`
                            : 'no ranked matches yet'}
                        </span>
                      </span>
                      <span className={`players__mp${(p.mpPoints ?? 0) < 0 ? ' players__mp--loss' : ''}`}>
                        {(p.mpMatches ?? 0) > 0 ? resultLabel(p.mpPoints ?? 0) : '—'}
                        <span className="players__mpunit">MP</span>
                      </span>
                    </Link>
                    <button type="button" className="btn btn--quiet players__rename"
                            onClick={() => { setEditing({ id: p.id, name: p.displayName }); setMessage(null); }}>
                      Rename
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
