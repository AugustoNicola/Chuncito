# Project Overview

Chuncito is a web-based companion for Riichi Mahjong matches in a group of friends. The idea is to combine:
- A match tracking application (like Riichi Log) for tracking the score and other stats of each player in a current match
- A hand score evaluator (already implemented in another project) so a user can input a hand + other relevant info and obtain the hand han/fu/point scores
- A storage system for saving previous matches, alongside user attribution to implement a match history, user stats, etc.

The application will be accesible via website, mainly designed for in-match usage via phone. Stats and profile interaction is planned for browser viewing, though.

## Match Tracking

This module will be designed for in-match usage. The design is heavily inspired by the application Riichi Log. The core aspects are described below.

The main page consists of the match status. In each side of the screen, radially, a box displays the status of each player: name, current wind seat, and points. Besides, there is a button to track a Riichi by that player. In the center of the screen, there is more general information: the current round (e.g. "East 3"), riichi and honba sticks.

Tapping the box of a player opens a menu for tracking a win by that player. Here, the user fills information about the win: mainly, tsumo/ron (and ron target). Also, the user needs to input the hand value; this can be done via specifying manually the han/fu score (e.g. 3 han 50 fu, or haneman), or by introducing the actual tile composition and other relevant information so that the system computes automatically the value (using the scoring module already implemented - see relevant documentation).

Tapping the central box opens a menu for tracking an abortive draw or similar rules (exhaustive draw / nagashi mangan).

The system tracks game status, including player scores, riichi sticks and honba sticks in the table, current round, and also end conditions, including a player reaching negative points. Besides, all changes are registered for later storage in the long-term history system.

There is also a timeline button to see this match's changes so far.

Besides, there should be buttons for manual control, including manually adjusting the scores of players, and advancing the round.

To start a match, configuration includes establishing which players are playing (allowing users and/or named guests), random seat ordering button, east or south match length, and uma (placement scores) configuration.

When the match ends, placements are calculated and displayed. There will also be a field for naming the match.

## Hand Scorer Integration

The code at /home/lambda/develop/Mahjonglog consists of a Prolog-based system for calculating score and yaku information from a given hand. This system will be used to display a screen akin to common online Mahjong clients, in which a screen displays all yakus the hand scores, and then the han/fu/points total. This screen will be stylized accordingly so it looks nice.

This system will interact with the Prolog scorer to gather the relevant information. More specifically, the query to be done will look like:

resultadoDeVictoria(+Mano, +FichaGanadora, +ModoVictoria, +Situacion, -Resultado)

  Inputs (all must be fully instantiated):

  - Mano = mano(FichasSueltas, Llamadas) — FichasSueltas is the list of concealed tiles in hand (14 tiles' worth once combined with any calls), Llamadas is the list of already-declared calls
    (chii(F1,F2,F3), pon(F1,F2,F3), kanA(F1,F2,F3,F4)).
  - FichaGanadora — the winning tile.
  - ModoVictoria — ron or tsumo.
  - Situacion = situacion(VientoRonda, VientoJugador, Doras, UraDoras, Flags) — round wind, seat wind, the dora tiles themselves (not indicators), ura dora tiles, and a flags list drawn from
    {riichi, dobleRiichi, ippatsu, houtei, haitei, rinshan, chankan, primeraRonda}.

  Output:

  Resultado = resultado(Yakus, Han, Fu, Nivel, Pago)

  - Yakus — [yakuHan(Nombre, Han), ...], already deduplicated/filtered for overlaps and sorted in standard client display order (situational → yakuhai → shape yaku → honitsu/chinitsu →
    yakuman → dora/akaDora/uraDora last).
  - Han, Fu — totals used for scoring (Fu is 0 when a yakuman applies).
  - Nivel — sinNombre, mangan, haneman, baiman, sanbaiman, kazoeYakuman, or yakuman/dobleYakuman/etc.
  - Pago — pago(Total) for ron, pagoTsumoDealer(PagoCadaUno) or pagoTsumo(PagoNoDealer, PagoDealer) for tsumo.

This project's backend will be absorbing that codebase so it directly calls the prolog code when this is needed.

Remember that when inputting a wining hand, there should also be an option to manuall set the hand's value instead of inputting the hand (e.g. say "2 han 30 fu" instead). This must be compatible with the storage system.

### Hand Data Input

The application Riichi Calc already has a nice design for introducing a hand in a mobile environment that I would like replicated. Here is a description of how it looks.

The bottom of the screen displays a "keyboard" of tiles: the tiles are distributed in four rows, one for each suit. Each row has a button for each tile in that suit. Above this keyboard, there is a small section with buttons for "chii", "pon", "kan" and "closed kan".

The remaining top portion of the screen is reserved for displaying the hand. It starts out empty.

Touching a tile button adds it to the hand - displaying it on the "closed" portion of the hand visualizer. Touching the tile visualization there acts as a way to remove the tile from the hand.

Touching any of the call buttons enables it, which is marked visually. Then, clicking any tile in the keyboard adds a call of that tile to the game, in the "calls" portion of the visualizer. In the case of a chii, clicking a tile adds an open run starting in that tile (e.g. chii on m3 adds a run m3-m4-m5). These calls are visualized as in real Mahjong: the three/four tiles are displayed together, and with rotated tiles when appropiate depending on the game. Only one of the call buttons may be active at any time, and clicking the active buttons deactivates it.

A keyboard button should become disabled if adding a new copy of that specific tile is impossible considering that there are four copies of each or other reasons. For example:
- No honors when "chii" is enabled, since there are no runs of honors
- If the hand already has two copies of a tile, the tile should become disabled if "pon", "kan" or "closed kan" are enabled
- And other similar reasons.

The last tile of the hand will always be considered the "winning tile" - the last one acquired. This is important for scoring purposes. This also means that a call cannot be introduced when adding it would complete the hand.

All of the above description corresponds to the first flap of this input system. There should also be another flap for adding all the other data about the hand and win required to score it. This includes:
- A selector for ron/tsumo
- Selectors for prevalent and round wind, each with the kanji of the four winds.
- Selector for none/riichi/doubleRiichi
- Checkboxes for:
  - Ippatsu (One-shot)
  - Chankan (Robbing a kan)
  - Rinshan (After a kan)
  - Last draw (for houtei or haitei)
- A checkbox for yakumans (specific list will be defined later on) 

In the same spirit of the call buttons, there will be two other buttons for "dora" and "ura dora"; enabling each makes it so clicking a tile in the keyboard adds the tile to the run of doras/ura doras.

All of this information is converted to the appropiate format to be sent to the Prolog system, which then returns the hand score and lets the tracker advance to displaying that.

## User and Storage System

Chuncito should work as a sort of match history for the group of friends; all matches played in the system will be stored, and there will be a "review match" screen similar to the timeline button in an ongoing match. All hand values and manual hands inserted should be saved.

Aside from this, a simple user system will be appropiate to atribute matches played to common players. This will be useful for viewing the progress, matches and stats for any individual players. This screen may look similar to common online Mahjong clients, like Mahjong Soul. I'm envisioning the following stats:
- time graph for viewing standing positions across last matches
- best hand: a section displaying the user's most valuable hand and scoring title (e.g. mangan)
- winning statistics: pie chart displaying riichi / open call / hidden tenpai statistics across all user matches
- ranking statistics: pie chart displaying standing distribution
- average rank
- tsumo rate
- deal-in rate
- riichi rate
- yaku achieved: a section displaying a list of most yakus, and how many times the user got each.

There should be a menu for viewing all users; clicking on a user opens the individual user screen described previously.

A "matches" screen displays all matches played within the system; there should be basic filtering and sorting utilities, mainly by match name, users involved. Some other special filterings desired:
- Filter by matches where a hand of X or more was achieved (for X in {mangan, haneman, ...}).
- Filter by matches where a yaku was achieved in any hand (and a selector of all yakus).

As you can see, due to these requirements, there is a need for storing what yakus each hand has, and other scoring data. Consider this in your data model.

## Style and Visual Requirements

The system should have a modern, dark-theme look. I'm interested in colors used to theme different limit hands (mangan, haneman, ...) when the title is presented in the scoring screen. 

Tiles should look good in all screens; the most likely solution I see is finding a good image for each one and loading that. 

The most important aspect is that it looks good in mobile, which is the main usage screen. However, I'm particularly intersted in a clean design for at least the "review" features in PC.

## Safety and Privacy

This system is intented to be used by the group of friends, internally. I'm particularly interested in not permiting access to external users, bots and scrapers. I believe the final solution to this will be decided when we're more into development, since having no access issues is better for iterating locally, but do keep it in mind. I'm thinking about a simple "PIN" system for unlocking the system on the final solution, but other solutions could arise.

## Development

This project is assigned to you - Claude - to see its development in its entirety. Given the scope of the project, I expect it to take multiple sessions, so plan and act in a way that allows you to continue progress smoothly later on. Write documentation as needed. Decide which modules and features to implement first, and what tech stack to use. Also, make recommendations about whether to clean/compact context or not.