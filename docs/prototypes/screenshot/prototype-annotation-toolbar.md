# Screenshot annotation toolbar

## Question

Which icon each tool of the screenshot annotation toolbar uses: rectangle, ellipse, arrow, line, pen, mosaic, blur, text, number, undo and redo. The page shows the toolbar over a mock screenshot and a table of the icon set with each icon's name and source library. Icons come from Lucide first, then Tabler where Lucide has no equivalent, then Material as the last resort; the SVG content is each library's official one.

## Structure basis

The toolbar's geometry is the app's: 24×24 buttons, a 1px gap, 3px padding, radius 8, and the background rgba(28,28,30,.95). The text tool keeps the literal letter "A" as its icon; that one character icon is an exception recorded in the project's `AGENTS.md` invariants.
