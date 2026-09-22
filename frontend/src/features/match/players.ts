/**
 * The group's players, as this phone knows them.
 *
 * A name typed at setup *is* a player: the first time a name is seen it gets an
 * id, made here so setup works offline, and every later match that seats that
 * name seats the same player. That is what lets Phase 4 put a person's history
 * together. The server hears of new players with the first match that seats
 * them (`sync.ts`), and hands back everyone it knows on start-up.
 *
 * **Sameness is the name, ignoring case and accents** -- "ana", "Ana" and "Aná"
 * are one person -- and the server applies the same test (`slugify` in
 * `backend/app/store.py`). When two phones each create a player offline, the
 * server keeps the first and says so; `applyAliases` follows it here.
 *
 * Kept in localStorage: small, synchronous, and read once at setup. Losing it
 * loses nothing the server does not also have.
 */
import { type SeatPlayer, uuid } from './matchState';

export interface RosterPlayer {
  id: string;
  name: string;
  /** For ordering the quick-fill chips: whoever played most recently first. */
  lastPlayed: string | null;
}

const ROSTER_KEY = 'chuncito.players';
/** The pre-roster list of typed names, migrated on first read. */
const OLD_NAMES_KEY = 'chuncito.names';
const MAX_CHIPS = 12;

/** The server's `slugify`, so both sides agree on who is who. */
export function slugOf(name: string): string {
  const plain = name.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
}

function read(): RosterPlayer[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((p): p is RosterPlayer =>
          typeof p?.id === 'string' && typeof p?.name === 'string');
      }
    }
    // First run with a roster: bring over the names the old version remembered.
    const old: unknown = JSON.parse(localStorage.getItem(OLD_NAMES_KEY) ?? '[]');
    if (Array.isArray(old)) {
      return old.filter((n): n is string => typeof n === 'string')
        .map((name) => ({ id: uuid(), name, lastPlayed: null }));
    }
  } catch {
    // Unreadable storage is an empty roster, not an error.
  }
  return [];
}

function write(roster: RosterPlayer[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch {
    // A roster that cannot be saved is rebuilt from the server next time.
  }
}

export const roster = (): RosterPlayer[] => read();

export const findByName = (list: readonly RosterPlayer[], name: string) =>
  list.find((p) => slugOf(p.name) === slugOf(name));

/** Names for the setup chips, most recently played first. */
export function recentNames(): string[] {
  return [...read()]
    .sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''))
    .slice(0, MAX_CHIPS)
    .map((p) => p.name);
}

/**
 * Turns the names typed at setup into seats, creating players for new names.
 * An existing player keeps the spelling they were registered with.
 */
export function seatPlayers(names: readonly string[], now = new Date()): SeatPlayer[] {
  const list = read();
  const seats = names.map((typed) => {
    const name = typed.trim();
    let player = findByName(list, name);
    if (!player) {
      player = { id: uuid(), name, lastPlayed: null };
      list.push(player);
    }
    player.lastPlayed = now.toISOString();
    return { playerId: player.id, name: player.name };
  });
  write(list);
  return seats;
}

export const nameOf = (id: string): string | undefined =>
  read().find((p) => p.id === id)?.name;

/**
 * Takes in the server's players. Its names win, and a local player it knows
 * under another id (created offline, on two phones) becomes that id.
 */
export function mergeServerPlayers(server: readonly { id: string; displayName: string }[]): void {
  const list = read();
  for (const remote of server) {
    const byId = list.find((p) => p.id === remote.id);
    if (byId) {
      byId.name = remote.displayName;
      continue;
    }
    const byName = findByName(list, remote.displayName);
    if (byName) {
      byName.id = remote.id;
      byName.name = remote.displayName;
    } else {
      list.push({ id: remote.id, name: remote.displayName, lastPlayed: null });
    }
  }
  write(list);
}

/** What the server said when it stored a player under an id it already had. */
export function applyAliases(aliases: Readonly<Record<string, string>>): void {
  if (Object.keys(aliases).length === 0) return;
  const list = read();
  for (const player of list) player.id = aliases[player.id] ?? player.id;
  // Two local entries may now be the same player; keep the first.
  write(list.filter((p, i) => list.findIndex((q) => q.id === p.id) === i));
}
