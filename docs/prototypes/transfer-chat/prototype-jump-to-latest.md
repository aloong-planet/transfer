# Jump-to-latest button

## Question

Target feature: the floating button that scrolls the message stream to the newest message, drawn as a glass float with no outer stroke. How deep should its tint be, at rest and on hover? Three tiers are shown side by side: A (rest .16, hover .30), B (rest .24, hover .40) and C (rest .32, hover .50).

Depth is set by the opacity of the purple fill, never by changing the hue: glass reads as glass because the content underneath shows through, and a fill that is too solid stops being glass.

## Structure basis

The tinted-glass texture without an outer stroke is the direction the user confirmed. The user asked for the tiers side by side, which is the multi-variant exception. The positioning technique is the app's: sticky, aligned to the flex end, a negative margin to cancel the space it takes, and `flex-shrink: 0`.

The simplified sidebar and chat page around the button give it real content density as context.

## Demo scaffolding

Not part of the design; do not implement.

- A dark pill at the bottom centre holds the variant switch (← / →), an unread-dot switch and a content-bed switch.
- "Content bed": the real app has no such control. The glass only shows when content sits under it, so the switch puts the button over a light blank area or over a dark image bubble. In the app, what lies underneath is wherever the user has scrolled to.
- "Unread dot": in the app the dot depends on whether a message arrived while the user was scrolled up; there is no control.
