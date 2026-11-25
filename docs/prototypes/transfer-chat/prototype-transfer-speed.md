# Transfer speed and total time in the file bubble

## Question

Target feature: a file bubble shows the live speed while a transfer runs and the total time once it is done. Where do the two numbers go, does the line disappear or change content when the transfer completes, and does the bubble survive the boundary cases? The page lays ten cases out in one message stream, in light and dark: ordinary, just started with no speed sample yet, very slow, over an hour, completed in seconds, in minutes, completed instantly, an image, failed, and a message from before the upgrade that has no time.

## Structure basis

The placement of time and speed is the direction the user confirmed; the transfer-chat spec holds the rules (its section on transfer speed and total time). The bubble geometry is the app's: max-width 74%, padding 8px 12px, radius 14 with a 5px bottom-right corner on own messages; the file row is a flex row with gap 9, the icon 30×30 with radius 8, the file name 12.5px at weight 560, the size 10.5px at opacity .65; the progress bar is 5px high with radius 3 and margin-top 8, its track in `--track` (own messages use `--own-wash`); the line under the bar is 9.5px with margin-top 3, opacity .85 and tabular numerals.

## Demo scaffolding

Not part of the design; do not implement. A floating "Demo ·" bar with a long-file-name switch. In the app a bubble's state comes from the message's real state; here the mock states are laid out side by side. The page follows the gallery's language and mode settings; the two panes stay light and dark whatever the mode is.
