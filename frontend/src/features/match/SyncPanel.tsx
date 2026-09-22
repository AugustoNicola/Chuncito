/**
 * Where the server stands, in words, and the one thing it might need: the PIN.
 *
 * Silent when everything is saved. The tracker never waits on any of this --
 * matches live on the phone first -- so the panel only speaks up when there is
 * something the person can do or ought to know.
 */
import { useState } from 'react';
import { refreshPlayers, sync, useSyncStatus } from './syncClient';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The group's PIN, asked for wherever the server has said it wants it. */
export function PinForm({ reason, onUnlocked }: { reason: string; onUnlocked?: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="sync__pin" onSubmit={async (e) => {
      e.preventDefault();
      if (!pin || busy) return;
      setBusy(true);
      const problem = await sync.unlock(pin);
      setBusy(false);
      setError(problem);
      if (!problem) {
        setPin('');
        void refreshPlayers();
        onUnlocked?.();
      }
    }}>
      <p className="sync__text">{reason}</p>
      <div className="sync__row">
        <input className="sync__input" type="password" inputMode="numeric"
               autoComplete="current-password" aria-label="PIN" placeholder="PIN"
               value={pin} onChange={(e) => setPin(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={!pin || busy}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
      {error && <p className="sync__error">{error}</p>}
    </form>
  );
}

export function SyncPanel() {
  const status = useSyncStatus();

  if (status.state === 'synced') return null;

  const matches = plural(status.pending, 'match', 'matches');

  return (
    <section className="sync" data-state={status.state} aria-live="polite">
      {status.state === 'locked' && (
        <PinForm reason={`${matches} on this phone ${status.pending === 1 ? 'is' : 'are'} not on
          the server yet. Enter the group's PIN to save them.`} />
      )}

      {status.state === 'waiting' && (
        <p className="sync__text">
          {matches} waiting for the server, which cannot be reached right now.
          {' '}{status.pending === 1 ? 'It is' : 'They are'} safe on this phone and will be
          sent when it answers.
        </p>
      )}

      {status.state === 'saving' && <p className="sync__text">Saving to the server…</p>}

      {status.state === 'problem' && status.problems.map(({ id, problem }) => (
        <div key={id} className="sync__problem">
          {problem === 'conflict' ? (
            <>
              <p className="sync__text">
                A match was changed on another device since this phone last saved it, so
                this phone's copy was not sent.
              </p>
              <button type="button" className="btn" onClick={() => sync.keepThisPhone(id)}>
                Replace it with this phone's copy
              </button>
            </>
          ) : (
            <p className="sync__text">
              The server refused a match as malformed. It is still on this phone.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

/** A dot for the match header: saved, saving, or not yet. */
export function SyncDot({ onClick }: { onClick: () => void }) {
  const status = useSyncStatus();
  const label = {
    synced: 'Saved to the server',
    saving: 'Saving to the server',
    waiting: 'Waiting for the server',
    locked: 'Not saved: the server needs the PIN',
    problem: 'Not saved: needs a decision',
  }[status.state];
  return (
    <button type="button" className="syncdot" data-state={status.state}
            aria-label={label} title={label} onClick={onClick} />
  );
}
