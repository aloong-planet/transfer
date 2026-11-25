# Chat empty-state icon

## Question

Which icon the chat area shows as its empty state when no conversation is selected: a radar with "Searching for devices on the LAN…" while no device has been found, and a message bubble with "Select a device on the left to start chatting" once devices have been found. The text already branches on whether any device has been found, so the icon follows the same condition and adds no new state.

The page shows both states at 40px in light and in dark.

## Structure basis

The empty state's geometry is the app's: a centred column on the card background, gap 8, muted text colour, the paragraph with the browser's default margins, and an explicit icon size.

## Demo scaffolding

Not part of the design; do not implement. The light and dark panes side by side.
