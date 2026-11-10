# ADR-0025: Windows hold only Transfer's own pages, IPC answers only them, and received files are quarantined

- Status: Accepted (2026-11-10)

## Context

Transfer shows what other devices on the LAN send it, and its pages are given Transfer's API. electron-scaffold's security checklist (items 4, 5, 12, 13, 14, 17) asks that a window never hold a page that is not the app's own, that IPC answer only the app's own frames, that a page get no permission it does not need, and that renderers run sandboxed. Browsers and AirDrop mark the files they bring in with a quarantine attribute, so that opening a downloaded app or script gets macOS's first-launch check; a file received through Transfer should be treated the same.

## Options

1. **Guard every web contents on origin (navigation, frame navigation, new windows, webviews), prevent unhandled drops in both pages, check the sender of every IPC call against the same origin rule, deny every permission but clipboard writing for Transfer's own pages, sandbox both renderers, and quarantine each received file explicitly before it gets its final name** — chosen.
2. Block navigation with `will-navigate` only — rejected: it covers the main frame only; a subframe navigates through `will-frame-navigate`, and `window.open` and webviews are separate doors (checklist items 13, 14, 12).
3. Prevent drops in the pages only — rejected: it stops one way of starting a navigation and leaves every other (a script, a link a future change might render); the main-process guard holds whatever starts it.
4. Check the IPC sender handler by handler — rejected: each new handler would be open until someone remembered; one wrapper, kept the only way to register by a static check, covers handlers written later.
5. Deny every permission — rejected: the screenshot overlay copies a picked colour with `navigator.clipboard.writeText`, which goes through the permission check.
6. Quarantine through `LSFileQuarantineEnabled` in the app's Info.plist — rejected: it marks every file Transfer creates, its own data and the screenshots a user saves included, and it says nothing in a run from source, where the receive path is tested; marking the received file itself states exactly what is meant and can be tested.
7. Set the attribute with a native module — rejected: Transfer ships no native module, and the system's `xattr` tool does the same with no build step.
8. Leave received files unquarantined — rejected by the owner (2026-11-06): opening a received app or script would keep skipping a check that a download or AirDrop gets.

## Decision

We choose **option 1**. The rule "is this URL one of Transfer's own pages" is one function, used by every guard: `app://bundle` in a packaged build, the development server's origin in a run from source, compared as parsed origins. The navigation guard is attached to every web contents as it is created. Both pages ignore a drop outside the message list, except text or a link dropped into a text field, which is inserted as before. Every IPC handler is registered through a wrapper that refuses a call from anything but a main frame on Transfer's own origin. The default session grants clipboard writing to Transfer's own pages and denies everything else. Both renderers run sandboxed. On macOS each received file gets `com.apple.quarantine`, naming Transfer, while it is still the partial file, so it never appears under its final name without it; a failure to set it is logged and the file is kept.

## Consequences

- Positive: a page that is not Transfer's cannot be loaded into a window by any route, and could not reach the API or a permission if it were.
- Positive: a received app or script gets macOS's first-launch check, as a download does.
- Negative: opening a received app or script shows the system's confirmation once, which it did not before.
- Negative: a volume that keeps no extended attributes cannot carry the quarantine; such a file is received without it (logged).
- Neutral: dropping files anywhere but the message list does nothing.
- Neutral: the drop-to-navigation step itself was not measured (it needs a real drag on screen); neither layer that stops it depends on it.

## Sources

- Spec: [electron-security](../specs/electron-security.md).
- electron-scaffold's `electron-security.md` (items 4, 5, 12, 13, 14, 17) and `electron-security-howto.md`.
- Measurements on 2026-11-06, and the owner's check of the sandboxed screenshot overlay on 2026-11-10 (kept with the working records).
- Owner's decision on quarantining received files (2026-11-06).
