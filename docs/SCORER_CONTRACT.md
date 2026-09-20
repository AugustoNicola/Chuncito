# Scorer contract

How TypeScript talks to the vendored Prolog engine. **This is the authority** —
the term details here are expensive to re-derive, and getting them subtly wrong
produces silent failures rather than errors.

Implementation: `frontend/src/scorer/`. Vendored engine: `scorer/mahjonglog/`.

## The one rule that bites

`resultadoDeVictoria/5` is **semidet**. For a non-winning hand, a yaku-less win,
*or a malformed input*, it simply **fails** — no exception, no message. All three
look identical from JavaScript.

That is why `validate.ts` exists and runs *before* every query: without it, a
typo'd meld and a genuine yaku-less hand both surface as "not a winning hand".

Failure is wrapped into data, never an absent solution:

```prolog
( resultadoDeVictoria(...) -> with_output_to(string(S), write_canonical(R)) ; S = "fail" )
```

## Tiles — 37 atoms

| Group | Atoms |
|---|---|
| Man | `m1`…`m9`, red five `m5R` |
| Pin | `p1`…`p9`, red five `p5R` |
| Sou | `s1`…`s9`, red five `s5R` |
| Winds | `e` `s` `w` `n` |
| Dragons | `r` (chun) `g` (hatsu) `wh` (haku) |

- **`s` alone is South wind; `s1`…`s9` are souzu.** Never infer suit from the
  first character without checking the honor set first.
- The `R` in `m5R` is capital. Atom case is significant.
- `===/2` treats a red five as equal to its plain twin, so `m5 === m5R`.
- **A suit has four fives, of which only three are plain.** The engine does not
  know this — it would accept four plain fives — so the supply is enforced in
  `validate.ts` (at most one `m5R`) and in `handState.ts` (at most three plain).
  It follows that a kan of fives always contains the red one.

## Canonical order — non-negotiable

Sort key is `(suit, number-or-honor-rank, isRedFive)`:

- Suits: man(1) < pin(2) < sou(3) < honor(4)
- Honors: `e`(1) `s`(2) `w`(3) `n`(4) `wh`(5) `g`(6) `r`(7)
- A red five sorts **immediately after** its plain twin

**Every meld's tile arguments must already be in this order.** `chii(m2,m1,m3)`
does not error — it fails, and the score comes back as "no winning hand".
`serialize.ts` sorts everything, so this is handled in exactly one place
(`order.ts`, mirroring `orden.pl`).

## Melds

Open and closed variants are *different functors*:

| Functor | Arity | Open? | Meaning |
|---|---|---|---|
| `chii` | 3 | open | called run |
| `pon` | 3 | open | called triplet |
| `kanA` | 4 | open | open kan |
| `kanC` | 4 | **closed** | concealed kan (ankan) |
| `escC` / `triC` | 3 | closed | concealed run / triplet — **inferred, never passed in** |
| `pareja` | 2 | — | the pair — inferred |
| `huerfanos` | 14 | — | kokushi, the whole hand as one form |

Only `chii`, `pon`, `kanA`, `kanC` go in `Llamadas` (TS: `DeclaredMeld`). An
ankan must be passed in because it cannot be inferred from loose tiles — upstream
`juegoPreformado/1` accepts it alongside the genuine calls.

An ankan does **not** open the hand: closed yaku values still apply.

## Input terms

```prolog
mano(FichasSueltas, Llamadas)
situacion(VientoRonda, VientoJugador, Doras, UraDoras, Flags)
```

- `FichasSueltas` — concealed tiles **including the winning tile**, any order.
- Winds are **Spanish** atoms `este|sur|oeste|norte`, *not* the tile atoms.
  `VientoJugador == este` means the winner is dealer.
- `Doras`/`UraDoras` are the **actual dora tiles, not indicators**. Duplicates
  are meaningful (counted with `member/2`). Indicator→dora conversion is ours,
  and lives in `scorer/dora.ts` — the UI collects *indicators*, since that is
  what a player sees on the table, and converts on the way into `toSituation`.
- **Aka dora is not listed** — it is derived from `redfive/1` tiles in the hand.
- `ModoVictoria` is `ron` | `tsumo`.

### Flags (exactly 8)

`riichi` `dobleRiichi` `ippatsu` `houtei` `haitei` `rinshan` `chankan` `primeraRonda`

Incompatible pairs: riichi↔dobleRiichi, houtei↔haitei, houtei↔rinshan,
chankan↔rinshan, haitei↔rinshan, chankan↔haitei, primeraRonda↔{riichi,
dobleRiichi, ippatsu}. Also: `ippatsu` requires a riichi; non-empty `UraDoras`
requires a riichi.

`tenhou`/`chiihou`/`renhou` are **not** flags — they are derived from
`primeraRonda` + mode + seat wind.

## Output

```prolog
resultado(Yakus, Han, Fu, Nivel, Pago)
```

- `Yakus` — `yakuHan(Name, Han)`, pre-sorted in client display order. 47 possible
  names: 30 regular yaku, 13 yakuman (always 13 han each), and 3 pseudo-yaku
  (`dora`, `akaDora`, `uraDora`) appended **last**, whose han is a count. Render
  the pseudo-yaku visually apart from real yaku.
- `Fu` is `0` whenever a yakuman applies; `25` for chiitoitsu; `20` pinfu tsumo.
- `Nivel` — `sinNombre` `mangan` `haneman` `baiman` `sanbaiman` `kazoeYakuman`
  `yakuman` `dobleYakuman` `tripleYakuman`, **plus a generated tail**
  `'4xYakuman'`, `'5xYakuman'`, … for 4+ stacked yakuman. Not a closed enum.
- `Pago` is a tagged union:
  - `pago(Total)` — ron, discarder pays
  - `pagoTsumoDealer(Each)` — winner is dealer, each opponent pays
  - `pagoTsumo(NonDealer, Dealer)` — winner is not dealer
  - **Honba and riichi sticks are not modelled.** The tracker adds them.

## Marshalling

Results come back via `write_canonical/1` as text, parsed by `term.ts`.

swipl-wasm *does* expose native bindings, but in an undocumented internal shape
(`{"$t":"t", functor:[[args]]}`). Canonical text is a specified surface, and it
lets browser output be compared byte-for-byte against the `swipl` CLI. Terms are
tiny, so parsing is noise against a ~1 ms query.

## Loading

Twelve `.pl` files are bundled as strings (`prologSource.ts`, Vite `?raw`),
written into the Emscripten virtual FS under `/chuncito`, then
`consult('/chuncito/mahjong.pl')` pulls in the other eleven via the upstream
relative `ensure_loaded` chain. There are no module declarations; everything
lands in `user`.

Measured: ~70 ms boot and ~40 ms consult in Node; **146 ms cold in Firefox**
including the 4 MB asset fetch; **~1 ms per query**.
