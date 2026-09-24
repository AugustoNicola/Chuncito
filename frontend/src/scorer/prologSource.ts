/**
 * The vendored Prolog, inlined as strings at build time.
 *
 * Imported straight from scorer/mahjonglog/src so there is exactly one copy in
 * the repo (see vite.config.ts `server.fs.allow`). Bundling rather than fetching
 * means the scorer has no extra network dependency and works offline for free.
 *
 * Order matters only in that `mahjong.pl` is consulted last; the others are
 * written to the virtual filesystem first so its `ensure_loaded` chain resolves.
 *
 * A file upstream adds must be added here too, or the predicates in it are
 * unknown at query time -- which the engine reports as a plain failure. The
 * test in `prologSource.test.ts` compares this list with the directory.
 */
import fichas from '../../../scorer/mahjonglog/src/fichas.pl?raw';
import juegos from '../../../scorer/mahjonglog/src/juegos.pl?raw';
import orden from '../../../scorer/mahjonglog/src/orden.pl?raw';
import formas from '../../../scorer/mahjonglog/src/formas.pl?raw';
import formaManoGanadora from '../../../scorer/mahjonglog/src/forma_mano_ganadora.pl?raw';
import victoria from '../../../scorer/mahjonglog/src/victoria.pl?raw';
import situacion from '../../../scorer/mahjonglog/src/situacion.pl?raw';
import yakus from '../../../scorer/mahjonglog/src/yakus.pl?raw';
import yakusAplicables from '../../../scorer/mahjonglog/src/yakus_aplicables.pl?raw';
import puntuacion from '../../../scorer/mahjonglog/src/puntuacion.pl?raw';
import reglas from '../../../scorer/mahjonglog/src/reglas.pl?raw';
import resultado from '../../../scorer/mahjonglog/src/resultado.pl?raw';
import mahjong from '../../../scorer/mahjonglog/src/mahjong.pl?raw';

/** Filename (as upstream `ensure_loaded` refers to it) -> source text. */
export const PROLOG_SOURCES: Readonly<Record<string, string>> = {
  'fichas.pl': fichas,
  'juegos.pl': juegos,
  'orden.pl': orden,
  'formas.pl': formas,
  'forma_mano_ganadora.pl': formaManoGanadora,
  'victoria.pl': victoria,
  'situacion.pl': situacion,
  'yakus.pl': yakus,
  'yakus_aplicables.pl': yakusAplicables,
  'puntuacion.pl': puntuacion,
  'reglas.pl': reglas,
  'resultado.pl': resultado,
  'mahjong.pl': mahjong,
};

export const ENTRY_FILE = 'mahjong.pl';
