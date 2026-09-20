import SWIPL from 'swipl-wasm/dist/swipl-node.js';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('../prolog');
const FILES = ['fichas','juegos','orden','formas','forma_mano_ganadora',
  'victoria','situacion','yakus','yakus_aplicables','puntuacion','resultado','mahjong'];

const t0 = Date.now();
const swipl = await SWIPL({ arguments: ['-q'] });
console.log(`boot: ${Date.now()-t0}ms`);

// Write the 12 .pl files into the Emscripten virtual FS, preserving names
// so the upstream relative ensure_loaded chain resolves.
swipl.FS.mkdir('/app');
for (const f of FILES) {
  swipl.FS.writeFile(`/app/${f}.pl`, fs.readFileSync(path.join(SRC, `${f}.pl`)));
}

const t1 = Date.now();
try {
  swipl.prolog.call("consult('/app/mahjong')");
  console.log(`consult: ${Date.now()-t1}ms  OK`);
} catch (e) {
  console.log('consult FAILED:', e.message || e);
  process.exit(1);
}

// sanity: are the autoloaded libs present?
for (const g of ["pairs_keys_values([a-1],_,_)", "maplist([X]>>(X>0),[1,2])"]) {
  let ok = false;
  try { ok = !!swipl.prolog.query(g).once(); } catch (e) { ok = 'ERR ' + e; }
  console.log(`  lib check ${g} -> ${ok}`);
}

// The known-good query, verified against the swipl CLI during planning.
const GOAL = `resultadoDeVictoria(mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5,m6,m7,m8],[]),
                m5, ron, situacion(este,sur,[],[],[]), R)`;

// (a) how does the raw binding come back?
const raw = swipl.prolog.query(GOAL).once();
console.log('\nraw binding keys:', Object.keys(raw));
console.log('typeof R:', typeof raw.R);
console.log('R inspect:', JSON.stringify(raw.R, (k,v)=>typeof v==='bigint'?String(v):v).slice(0,400));

// (b) string round-trip via write_canonical — dialect-proof fallback
const s = swipl.prolog.query(
  `( ${GOAL} -> with_output_to(string(S), write_canonical(R)) ; S = "nowin" )`
).once();
console.log('\ncanonical string:', s.S);

const t2 = Date.now();
for (let i=0;i<100;i++) swipl.prolog.query(GOAL).once();
console.log(`\n100 queries: ${Date.now()-t2}ms total`);
