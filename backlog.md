# Opengraph Design
Based on the logo + title design (blue red dragon kanji + "Chuncito"), make a favicon.ico (logo) and opengraph portrait (logo + title with dark ground).

# Scoring Attribution
When on the scoring screen for a hand (the one that shows '4 han * 30 fu\n11,600\n Dealer ron'), also show player info (i.e. player who tsumo'd, or player who ronned and who got ronned).

# Invalid Button Combinations
The han/fu and other buttons currently allow invalid combinations. Here are some of them:
- Considering that tsumo gives +2 fu, selecting tsumo should disable 20 fu.
- A closed hand + tsumo gives menzen tsumo, which is worth 1 han, and so does riichi. Thus, riichi + tsumo + closed hand should disable 1 han.
- Riichi and open hand
- 25 fu and open hand
Think of these situations (checking riichi.wiki or Mahjonglog if necessary) to find invalid combinations, and make sure they are unselectable. The preferred method is disabling certain buttons that make the combination imposible.

# Optional Closed/Open Hand

Make the Open/Closed buttons in manual hand scoring optional; there should be no default here, and selecting should not be needed. If a hand is submitted without specifying a value here, omit it for the purposes of statistics (when calculating open/riichi/closed no riichi).

# Open Riichi

We need to implement the rule "Open Riichi": this should be a new riichi option (alongside riichi and double riichi). It is worth 2 han, and of course can only be done following the same rules as riichi (payment + closed hand + tenpai).

The prolog scorer (Mahjonglog) does not yet support it; it should be added there. Launch a subagent if needed to advance Mahjonglog.

Also, a new rule selection appears: whether open riichi ron is worth normally or a yakuman. By default, it is worth normally, but make it a selectable rule when creating the match, and devise a way for that rule (alongside other custom rules) to be sent to the scorer.

# First Round Win not working

The First round win button doesn't seem to be working when combined with ron (renhou). Check the feature.

# Manual Hand Scoring should save hand

Currently, going back from the manual hand scorer makes it so the hand progress is lost when coming back. Try to save the scorer state somewhere, so it is preserved when going back.

This, however, should take into account introducing a hand that is valid under certain conditions selected previously, going back and changing those conditions, and then returning to the hand. For example, calls are not permitted when riichi was called.

# Call Buttons Disabled on Riichi

Buttons involving open calls (Chii, Pon, and Kan) should be disabled if the hand called riichi. Manage this interacting with changing the riichi state.

# Ura Dora Button only Enabled on Riichi

Ura Dora should only be clickable when riichi is enabled.

# Players sorted by placement

In all screens that deal with showing the points of players (mostly match end), sort the players by (current) placement. When on a match end screen, also show each player's original wind (or last round's wind if in the middle of a match).

# Player List should look better

Currently, the list of players in /players looks bland. Make each player its own horizontal box, spanning available width, and use a cooler design.

This also intersects with the planned ranking system; each player should display their MAKApoints (upcoming rank points), and top three should be bronze/silver/gold themed.

# More Links to player profiles

There are many places where player names appear and are unclickable. Except in cases like in the middle of a match, we should make most of those clickable so they send you to that player's profile.

# Better Hovers in Player Profile

We should improve the hover tooltips in many components from /players/xxx:
- the hover for each point in the Placements graph (last played match) should show the name of all players involved and their scores, and bold the current player's name. Color-code using gold/silver/bronze.
- The Hand Values histogram should not show bin count above each bin; instead, put that in a hover tooltip for each bar that shows total count and percentage (e.g. "42 (36.6%)")

# Clean Point Ranking System

I discussed how ranking points work typically after a mahjong game ends, which wasn't very clear to me before. If I understand correctly, it is very important that total points sum to zero, since the game is based on gambling real money. This means that oka is a way for the first place to collect the difference between starting points (usually 25k) and the target score (usually 30k). In four players, that 30-25=5k difference would mean that 20k would be "lost", so they are given to 1st place. Also, due to this same reason, the umas for all players should sum to zero (like +30/+10/-10/-30). We should make sure that this is enforced and clearly detailed when scoring a match at the end.

# Change How to enter best hand's match in user profile

Scrap the "see that match" button on the Best Hand component in user profile, and instead make the entire box clickable.

# Double Yakumans

The Mahjonglog engine currently does not support standard double yakumans. We should make sure that:
- The enginge supports them and calculates them cleanly (based on what rules riichi.wiki says)
- Multiple yakuman are selectable in the "introduce hand value" system (without introducing the hand itself).
- Theme wise, just keep using the gold theme of normal yakuman
  
# Scrap a Match on Match End

Introduce a button for discarding a match in the same place where you would usually save it.

# Goal Score and Sudden Death

Given my previous confusion about oka and uma and scoring, we should make sure that we aren't confounding target score (that value, usually 30k, to which your final point total is compared, and which is related to oka), and goal score (the point threshold needed to end the match on south 4).

Also, let's make sure that end game rules are correctly implemented. I want the system in which if no one is above the goal score, the match continues for another wind, until someone surpasses the goal score or the wind round ends.

# Riichi Sticks on Match End

Implement the rule by which remaining riichi sticks on the table when a match ends go to the first place.

# New User Stat: Average Point Score

Add a new stat to the user profile: average point score, computed as the average of all hands won (without normalizing by dealer or honba).

# Sort Player Selection Alphabetically

Display user names alphabetically when selecting for a new match.

# Rearrange Rinshan and Chankan

Since Rinshan and chankan are very similar, change the order of the four buttons so it is: Ippatsu, Last Draw, Chankan, Rinshan.

# Bug: Round advance displays ghost round

Currently, the summary screen displays "East 4 -> South 1" when an East match is about to end. Correctly identify this situation and show something like "East 4 -> end". Same for South Match.

# Clicking Back button on History Undoes filters

Currently, clicking the back button on /matches goes to the latest URL, which only changes the filters applied. Instead, it should actually send you to the main page.

# Create Gap between Wind and Dragon Tiles

For aesthetic purposes, I think the keyboard tile selector would look better if we moved the two-tile gap to the center, thus moving each group to the sides.

# Advance Buttons should remain visible

Throughout the app, many important buttons in many screens can only be seen after scrolling. I would like for these buttons commonly at the bottom of the form to remain sticked to the bottom of the screen with a clear separator. Thus, even when disabled, they remain visible without scrolling.

# Display Fu Breakdown

I would like for the hand scorer to display fu breakdown, as it does for han. This would be less important and should appear grayed beside all han lines.

For this to work, Mahjonglog needs to provide the fu breakdown. Devise a way for this information to reach Chuncito.

# hide Rules by default when creating match

On the match creation screen, put all optional/defaulted fields except for match length in a foldable component and make it folded by default (like the current "all player's matches" in a player's profile). This will help hide unnecessary complexity.

# Ranking System: MAKApoints

I would like to design a ranking points system akin to most Mahjong online games and other competitive games. They will be called MAKApoints (abbreviated MP). They are calculated following the standard formula of: 

(finalScore - targetScore) + uma (+ oka if first), all rounded from the thousandths.

For example, ending second with 34500 points in a 4player match with umas +30/+10/-10/-30 and target score 30k (which implies an oka of +20), results in:

(34500 pts - 30000 pts) + 10000 pts + 0 = 14500 pts = +14.5 MP

MPs after a match can be positive or negative, and the idea is that your current MPs is just the sum of all your matches' MPs (starting from zero). Using this, players will be sorted in the /players view (as explained earlier). Also, gained and new total MPs for each player should appear on match's end. Every match can be played "for MPs" or without; this is decided when saving the match.

# Standing Timelapse

It would be great to see a line chart (very similar to the "last matches' placements" graph in a player profile) that displays each player's position in each point of the match. Assign a fixed color to each wind (blue red green purple) and plot each player's placement at each round point. This would appear at the top of the timeline of an ongoing match, and also when reviewing any completed match on top of the list of rounds.

Aside from this, the box of each round's delta in points for each player should also display each player's ranking after that round ended, to make it clear who was in each position at each time. Visually, you can add it vertically before the point delta of each player's name. Remember to color-code the labels "1st/2nd/..." using the typical bronze-silver-gold palette.

# Honor Keys Position in Keyboard

Move the honor tiles (winds and dragons) to the center of the keyboard in the hand calculator. The remaining space should be at the borders of the row.

# Feature for Changing Ongoing Match's Duration

It is quite common that we start an east-south match and decide to end it at east instead of playing the south rounds. Also, sometimes, we finish an east match and would like to instead keep playing the south rounds. There should be features for each of those.

For the first case, I would like that after pressing the "End Early" button, when reviewing the match, if it was an East-South and no South round was played, a new "Save as East Match" button should appear. It stores the match normally, but changes its original duration to East Match. It should work even if we end it before playing East 4.

For the second case, When reviewing the end of an East Match, a new "Continue as South Match" button should appear. This will keep the match ongoing, sending us to the corresponding new round (it may not always be South 1 I think, check that ruling for me).

# Player Profile UI Upgrades

I have some changes for the part of the player profile UI that has all of the boxes with data:

- Remove the "uma" box
- Make the "MAKApoints box" occupy the entire horizontal width; use the new space at the right to display the number with a circle displaying the player's rank (same as in the "Players" screen)
- The remaining six boxes should be organized in two rows (three per row).
- Color-code all boxes, using the same themeing style as in round boxes when there is a Mangan or above hand. The colors should be:
  - MAKApoints: blue, app's primary colour
  - Average place: silver (as Sanbaiman-colour)
  - Win rate: green (as Mangan-colour)
  - Tsumo rate: purple (as Haneman-colour)
  - Deal-in rate: red
  - Riichi rate: yellow 
  - Average win: bronze (as Baiman-colour)

# Change MAKApoints calculation to be not zero-sum

After calculating MPs as it is currently done, add a +5 MP bonus to each player. This will break the zero-sum of the system, but I think it is a nice reward for usual players and reflects matches played. This new errata'd number is what should appear.

# Show Honba/Repeats in Hand Breakdown

In the hand breakdown screen (the one that appears after "Score Hand" in the calculator), below the hand value there should appear a new line with honba information if there are honbas on the table. For a ron, it should say "+<pts> due to <n> honba" (e.g. "+600 due to 2 honba"), and for tsumo it should display "+<pts> all due to <n> honba" (e.g. "+100 all due to 1 honba"). This new line should be clearly visible below the current stuff, and should only appear if there are nonzero honbas.

# Track and Show Round Duration

I would like for us to track the duration of each round of play and the total match duration. The duration of each round should appear in the boxes of the timelapse and match review, and the total match duration should appear in the boxes of the Matches menu and other places where match info is displayed.

We do not want an "ongoing match/round time" timer to appear in the main match page.

Remember that the matches played so far will not have this information available; see how you can manage those null cases.
