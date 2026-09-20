/**
 * Loads the vendored Prolog into a SWI-Prolog WASM instance and scores hands.
 *
 * Deliberately agnostic about *how* the WASM module was created, so the same
 * code runs under Node (tests, via swipl-node) and in the browser.
 */
import { decodeScoreOutcome } from './decode';
import { ENTRY_FILE, PROLOG_SOURCES } from './prologSource';
import { serializeScoreGoal } from './serialize';
import type { ScoreOutcome, ScoreQuery } from './types';
import { validateQuery, type ValidationIssue } from './validate';

/** The slice of swipl-wasm's module surface we actually rely on. */
export interface SwiplModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | ArrayBufferView): void;
  };
  prolog: {
    call(goal: string): unknown;
    query(goal: string): { once(): unknown };
  };
}

export type SwiplFactory = () => Promise<SwiplModule>;

const APP_DIR = '/chuncito';

export class ScorerError extends Error {}

export class ValidationError extends ScorerError {
  constructor(readonly issues: ValidationIssue[]) {
    super(`invalid score query:\n  ${issues.map((i) => i.message).join('\n  ')}`);
    this.name = 'ValidationError';
  }
}

export interface Scorer {
  /** Validates, then scores. A non-winning hand is `{ok:false}`, not a throw. */
  score(query: ScoreQuery): ScoreOutcome;
  /** Escape hatch for tests and the golden-file harness. */
  rawCanonical(goal: string): string;
}

function unwrapString(value: unknown): string {
  // swipl-wasm returns strings as PrologString objects ({$t:'s', v:'...'}).
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'v' in value) {
    const inner = (value as { v: unknown }).v;
    if (typeof inner === 'string') return inner;
  }
  throw new ScorerError(`expected a string binding, got ${JSON.stringify(value)}`);
}

export async function createScorer(factory: SwiplFactory): Promise<Scorer> {
  const swipl = await factory();

  try {
    swipl.FS.mkdir(APP_DIR);
  } catch {
    // Already present (a second scorer in the same instance); harmless.
  }
  for (const [name, source] of Object.entries(PROLOG_SOURCES)) {
    swipl.FS.writeFile(`${APP_DIR}/${name}`, source);
  }

  // Relative ensure_loaded/1 names resolve against the consulting file's
  // directory, so consulting the entry file pulls in the other eleven.
  try {
    swipl.prolog.call(`consult('${APP_DIR}/${ENTRY_FILE}')`);
  } catch (cause) {
    throw new ScorerError(`failed to consult the vendored Prolog: ${String(cause)}`);
  }

  const rawCanonical = (goal: string): string => {
    const solution = swipl.prolog.query(goal).once() as Record<string, unknown> | false | null;
    if (!solution || typeof solution !== 'object' || !('S' in solution)) {
      // The goal is wrapped in an if-then-else, so it must always succeed.
      throw new ScorerError(`goal did not yield a solution: ${goal}`);
    }
    return unwrapString(solution.S);
  };

  return {
    rawCanonical,
    score(query) {
      const issues = validateQuery(query);
      if (issues.length > 0) throw new ValidationError(issues);
      return decodeScoreOutcome(rawCanonical(serializeScoreGoal(query)));
    },
  };
}
