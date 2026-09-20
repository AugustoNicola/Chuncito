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

## Ours to implement (not upstream bugs)

### No input validation in the entry point
The engine scores a bogus wind (`marte`), an unknown flag (`volar`), and fourteen
identical tiles without complaint. Since malformed input *fails* exactly like a
yaku-less hand, everything is validated client-side first
(`frontend/src/scorer/validate.ts`).

### No dora-indicator → dora conversion
`situacion.pl` declares it out of scope: `Doras` holds the actual dora tiles.
Trivial (advance with wraparound), but ours. The tile-input UI sidesteps it by
having the user tap the dora tile directly; it only matters if indicator entry is
added. Store **both** the indicator and the resolved dora in match history — the
indicator is what you'd want to see in a review.

## Known behaviour worth knowing (not bugs)

| Behaviour | Note |
|---|---|
| `renhou` scored as a full yakuman | Upstream comment flags it as adjustable. Many rulesets score it as mangan. A likely future config knob. |
| Fu and yaku not *jointly* optimised | Deliberate upstream simplification. When the winning tile fits several melds, yaku and fu are maximised independently, so rare edge cases may differ slightly from a reference calculator. |
| No double-yakuman variants | suuankou tanki, kokushi 13-wait, junsei chuuren are flat 13 han. Stacked yakuman *do* combine (suuankou + chinroutou = `dobleYakuman`, 26 han). |
| `kazoeYakuman` is a level, never a yaku | Caps at one yakuman regardless of han. |
| Ron tile ambiguity resolved in the winner's favour | `FormasGanadoras` records the winning tile's value, not which meld received it. |
