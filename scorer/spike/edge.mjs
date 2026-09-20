import SWIPL from 'swipl-wasm/dist/swipl-node.js';
import fs from 'node:fs'; import path from 'node:path';
const SRC = path.resolve('../prolog');
const FILES = ['fichas','juegos','orden','formas','forma_mano_ganadora','victoria',
  'situacion','yakus','yakus_aplicables','puntuacion','resultado','mahjong'];
const swipl = await SWIPL({ arguments: ['-q'] });
swipl.FS.mkdir('/app');
for (const f of FILES) swipl.FS.writeFile(`/app/${f}.pl`, fs.readFileSync(path.join(SRC,`${f}.pl`)));
swipl.prolog.call("consult('/app/mahjong')");

const canon = (goal) => {
  try {
    const r = swipl.prolog.query(
      `( ${goal} -> with_output_to(string(S), write_canonical(R)) ; S = "FAIL" )`).once();
    return r && r.S ? (r.S.v ?? r.S) : `NO-SOLUTION(${JSON.stringify(r)})`;
  } catch (e) { return 'EXCEPTION: ' + (e.message || e); }
};
const R = (m,w,mode,sit) => `resultadoDeVictoria(${m}, ${w}, ${mode}, ${sit}, R)`;

const cases = {
  'no yaku (should FAIL)':
    R('mano([m1,m1,m2,m3,m4,p5,p6,p7,s2,s3,s4,n,n,n],[])','m4','ron','situacion(este,sur,[],[],[])'),
  'tsumo non-dealer (pagoTsumo/2)':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5,m6,m7,m8],[])','m5','tsumo','situacion(este,sur,[],[],[])'),
  'tsumo dealer (pagoTsumoDealer/1)':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5,m6,m7,m8],[])','m5','tsumo','situacion(este,este,[],[],[])'),
  'open kan via kanA':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5],[kanA(m1,m1,m1,m1)])','m5','ron','situacion(este,sur,[],[],[])'),
  'CLOSED kan via kanC (known gap)':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5],[kanC(m1,m1,m1,m1)])','m5','ron','situacion(este,sur,[],[],[])'),
  'kokushi -> yakuman':
    R('mano([m1,m9,p1,p9,s1,s9,e,s,w,n,wh,g,r,m1],[])','m1','tsumo','situacion(este,sur,[],[],[])'),
  'double yakuman (open-ended Nivel)':
    R('mano([m1,m1,m1,m1,m1,m1,m1,m1,m1,m1,m1,m1,m1,m1],[])','m1','tsumo','situacion(este,sur,[],[],[])'),
  'UNSORTED meld args (should FAIL)':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5],[chii(s8,s6,s7)])','m5','ron','situacion(este,sur,[],[],[])'),
  'sorted equivalent (should work)':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5],[chii(s6,s7,s8)])','m5','ron','situacion(este,sur,[],[],[])'),
  'BOGUS wind+flag (no validation upstream)':
    R('mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5,m6,m7,m8],[])','m5','ron','situacion(marte,sur,[],[],[volar])'),
};
for (const [name, goal] of Object.entries(cases)) console.log(`${name}\n   -> ${canon(goal)}\n`);
