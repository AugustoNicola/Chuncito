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

## Known behaviour worth knowing (not bugs)

| Behaviour | Note |
|---|---|
| `renhou` scored as a full yakuman | Upstream comment flags it as adjustable. Many rulesets score it as mangan. A likely future config knob. |
| Fu and yaku not *jointly* optimised | Deliberate upstream simplification. When the winning tile fits several melds, yaku and fu are maximised independently, so rare edge cases may differ slightly from a reference calculator. |
| No double-yakuman variants | suuankou tanki, kokushi 13-wait, junsei chuuren are flat 13 han. Stacked yakuman *do* combine (suuankou + chinroutou = `dobleYakuman`, 26 han). |
| `kazoeYakuman` is a level, never a yaku | Caps at one yakuman regardless of han. |
| Ron tile ambiguity resolved in the winner's favour | `FormasGanadoras` records the winning tile's value, not which meld received it. |
