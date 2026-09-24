# Scorer gaps

`Mahjonglog` is under active development, so gaps are expected. The discipline:

1. Build against the **documented contract**, not current behaviour. If a feature
   should work, write the client as if it does.
2. When a gap is hit, log it here (symptom, minimal reproducing query, what the
   contract implies) and **report it**. Don't silently work around it, and don't
   patch upstream unasked.
3. `frontend/src/scorer/scorer.test.ts` doubles as a conformance suite — after a
   re-vendor it immediately shows what changed.
4. `scorer/sync-prolog.sh` refuses to vendor a tree whose own tests fail.

## Resolved

### `kanC` unreachable through the entry point — FIXED upstream 2026-09-19
`Llamadas` was validated with `llamada/1`, and `kanC` is `oculta/1`, so any hand
with an ankan failed outright. Fixed by `juegoPreformado/1` in
`forma_mano_ganadora.pl`, which accepts a genuine call *or* a pre-formed `kanC`,
with a cut so `kanA` isn't counted twice. Verified: ankan now scores, keeps the
hand closed (`sanshokuDoujun` 2 han rather than 1), and yields 70 fu for a
concealed terminal kan. Covered by a regression test.

## Open — upstream

### `riichi` is granted on an open hand
`yaku(riichi, _, situacion(...))` checks only that the flag is present, with no
closed-hand condition. Same for `dobleRiichi` and `ippatsu`. Reproduces:

```prolog
resultadoDeVictoria(mano([m2,m2,m3,m4,m5,p3,p4,p5],[pon(s3,s3,s3),chii(m6,m7,m8)]),
                    m5, ron, situacion(este,sur,[],[],[riichi]), R).
% R = resultado([yakuHan(riichi,1),yakuHan(tanyao,1)],2,30,sinNombre,pago(2000))
```

A riichi requires a concealed hand, so this should fail. Contrast `menzenTsumo`,
which does guard with `manoCerrada(Formas)` — the same check is what riichi
needs. Note an ankan keeps a hand closed, so the condition is "no `llamada/1`
meld", not "no melds".

Guarded client-side for now (`contextIssue` in `handState.ts` refuses a riichi on
an open hand, and retracts one if the hand is later opened), so the UI cannot
produce this. **Reported to the user.**

### No nukidora (sanma kita) input
Sanma is supported by the client (2026-09-21), and pulled Norths are dora han
there. `situacion/5` has no slot for them, and the Norths are no longer in the
hand, so the engine cannot count them. Everything else in sanma needs nothing
from upstream: the payment table is the same, a `Payment` is per payer (the
client just has one payer fewer), and 1m→9m indicators are resolved client-side
before the query like every other indicator.

Implemented client-side in `frontend/src/features/hand/nukidora.ts`: the engine
scores the hand without the kita, then each pulled North adds a han (plus one
per dora/ura that is a North), and level and payment are re-derived from the new
han and the engine's fu. It is skipped under a yakuman, as all dora are.

One case this cannot get right. `resultadoDeVictoria/5` picks the decomposition
with the best payment *without* the kita. Adding a constant han can reorder two
decompositions that tied or nearly tied — e.g. 3 han 40 fu and 4 han 20 fu are
both 1280 base, but with two kita they are 5 han (mangan) and 6 han (haneman). The
client only sees the one the engine chose. Rare, and it needs a hand with two
genuinely different readings; the fix is upstream taking a kita count (a
`nukidora(N)` term in the situation, say) and counting it with the dora.
**Reported to the user.**

## Ours to implement (not upstream bugs)

### No input validation in the entry point
The engine scores a bogus wind (`marte`), an unknown flag (`volar`), and fourteen
identical tiles without complaint. Since malformed input *fails* exactly like a
yaku-less hand, everything is validated client-side first
(`frontend/src/scorer/validate.ts`).

### No dora-indicator → dora conversion — DONE client-side
`situacion.pl` declares it out of scope: `Doras` holds the actual dora tiles.
Implemented in `frontend/src/scorer/dora.ts` (advance with wraparound; winds
cycle E→S→W→N, dragons haku→hatsu→chun; a red five indicates what its plain twin
does, and a dora is never the red copy).

The UI collects **indicators**, which is what a player actually sees on the
table, and displays the resolved dora next to each one. Match history should
store the indicator, for the same reason.

In sanma the manzu cycle is 1m→9m→1m, since 2m–8m are not in the set; that is
`doraFromIndicator(tile, sanma)`.

### Open riichi and house rules — DONE upstream 2026-09-24
Added in the Mahjonglog working tree (uncommitted there, alongside earlier
uncommitted work): the `riichiAbierto` flag and yaku, `resultadoDeVictoria/6`
with a rule list (`reglas.pl`), and the first rule, `riichiAbiertoRonYakuman`.
See `SCORER_CONTRACT.md`. Noticed while doing it, not changed:

- A yaku missing from `ordenYaku/2` silently vanishes from the output, since
  the sort filters through it. Any new yaku needs an entry there.
- Upstream added a source file (`reglas.pl`), and the client's bundle lists
  files by hand, so every query failed until it was added.
  `prologSource.test.ts` now compares the bundle with the directory.

## Known behaviour worth knowing (not bugs)

| Behaviour | Note |
|---|---|
| `renhou` scored as a full yakuman | Upstream comment flags it as adjustable. Many rulesets score it as mangan. A likely future config knob. |
| Fu and yaku not *jointly* optimised | Deliberate upstream simplification. When the winning tile fits several melds, yaku and fu are maximised independently, so rare edge cases may differ slightly from a reference calculator. |
| No double-yakuman variants | suuankou tanki, kokushi 13-wait, junsei chuuren are flat 13 han. Stacked yakuman *do* combine (suuankou + chinroutou = `dobleYakuman`, 26 han). |
| `kazoeYakuman` is a level, never a yaku | Caps at one yakuman regardless of han. |
| Ron tile ambiguity resolved in the winner's favour | `FormasGanadoras` records the winning tile's value, not which meld received it. |
