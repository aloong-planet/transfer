# Electron security baseline

> Related: no features entry for the baseline itself; the quarantine of received files (electron-security::REQ-001) is user-visible and described in [features/transfer-chat.md](../features/transfer-chat.md) · ADR-0024 (launch inputs) · ADR-0025 · [ops/electron-security.md](../ops/electron-security.md) (the ledger)

## Problem Statement

Transfer shows what other devices on the LAN send it, and it runs with what the user granted it. Its windows must therefore only ever hold Transfer's own pages: a page that is not Transfer's must never reach Transfer's API, the user's permissions or a less restricted process. And a file another device sent must be treated by macOS as what it is — a file from somewhere else — when the user opens it.

## Solution

Every window runs only Transfer's own pages, sandboxed, and nothing can navigate it elsewhere, open a new window or attach a webview. The main process answers IPC only from Transfer's own main frames, and grants a page no permission except writing to the clipboard from Transfer's own pages. On macOS every received file carries the quarantine attribute, as a browser download or AirDrop does. Each item of the Electron security checklist is recorded with its status in a ledger.

## Functional Requirements

### electron-security::REQ-001 Received files are quarantined on macOS

Applies to: every file Transfer receives from another device, on macOS (the Developer ID and the Mac App Store builds).

- electron-security::REQ-001/AC-01: A received file carries the `com.apple.quarantine` attribute, naming Transfer as the agent, from the moment it appears under its final name.
- electron-security::REQ-001/AC-02: Opening a received app or script — through Transfer or from Finder — gets macOS's first-launch check, as a downloaded one would; a document opens as before.
- electron-security::REQ-001/AC-03: A file whose attribute cannot be set (for example on a volume that keeps no extended attributes) is still received and kept; the failure is logged, not shown.
- electron-security::REQ-001/AC-04: On other platforms received files are written as before.

## Constraints

### electron-security::CON-001 Only Transfer's own pages, in every window (direct acceptance)

Applies to: every web contents Transfer creates — the main window, the screenshot overlay, the windows that dim the other screens during a screenshot, and any created later. A navigation of a main frame or of any frame to an origin other than Transfer's own (`app://bundle` in a packaged build; the development server's origin in a run from source), whoever starts it — a link, a script, a dropped file or link — is cancelled; a request for a new window is denied; a webview is never attached. Origins are compared after parsing, never by string prefix.

### electron-security::CON-002 Dropping onto a window does nothing outside the drop target

Applies to: every window. A file or link dropped anywhere on a window other than the open chat's message list is ignored: the window stays where it is and nothing is sent. Dropping files on the message list sends them, as before.

### electron-security::CON-003 IPC answers only Transfer's own main frames

- electron-security::CON-003/AC-01: Every handler the main process registers for the renderer goes through one check; none is registered without it.
- electron-security::CON-003/AC-02: A call whose sending frame is not a main frame on Transfer's own origin is refused with an error, and its handler does not run.

### electron-security::CON-004 Permissions (direct acceptance)

Applies to: the default session. A page is granted writing to the clipboard when it is one of Transfer's own pages (the screenshot overlay copies a picked colour); every other permission request and permission check is denied.

### electron-security::CON-005 Sandboxed renderers (direct acceptance)

Applies to: every window. Their renderers run sandboxed (the dimming windows already were, by default), and the preload uses only what a sandboxed preload may.

### electron-security::CON-006 A ledger of the checklist (direct acceptance)

`docs/ops/electron-security.md` lists every item of electron-scaffold's security checklist with Transfer's status, the evidence or test that holds it, and, for an item not done, why. It is updated whenever the conditions the checklist names for a new pass occur (window, session, protocol or IPC configuration, a new launch input, an Electron major upgrade, a new packaging platform, new content rendered from elsewhere).

## Failure modes and boundaries

### Content from another device

- A text message, a file name or a device alias that looks like HTML, a script or a URL: shown as text; nothing in it becomes clickable or runs (as before; Transfer renders no link or markup).
- An image, including SVG: shown in an `<img>`; it runs nothing and loads nothing.
- A received HTML file, or any link, dropped onto a window outside the message list: nothing happens (electron-security::CON-002); were a navigation to start anyway, it is cancelled (electron-security::CON-001).
- A received app, script or disk image opened later: macOS's first-launch check applies (electron-security::REQ-001/AC-02).
- A received file on a volume without extended attributes: received and kept; the quarantine is missing and logged (electron-security::REQ-001/AC-03).
- Two files received at once, or a transfer cancelled midway: each finished file is quarantined before it appears; a partial file never appears under a final name (as before).

### The app itself

- Transfer's own page navigating within itself (the `app://` entry pages): allowed. A run from source loading the development server: allowed, by its origin.
- `window.open`, a `target="_blank"` link, a webview created by script: denied (electron-security::CON-001).
- A subframe on Transfer's own origin calling IPC: refused — Transfer has no subframes, so a frame is never a legitimate caller (electron-security::CON-003/AC-02).
- The overlay copying a picked colour: allowed; asking for the camera, the microphone, notifications, geolocation or anything else: denied (electron-security::CON-004).
- Screen capture for the screenshot is taken in the main process and needs no page permission.

## Implementation Decisions

- The origin rule is one pure function shared by the navigation guard, the window-open handler, the IPC check and the permission handler: given a URL and whether the build is packaged (and the development server's URL from source), it says whether the URL is Transfer's own. It parses the URL and compares origins.
- The navigation guard hangs off the app's `web-contents-created` event, so it covers every web contents, including ones created later; it handles `will-navigate`, `will-frame-navigate`, `will-attach-webview` and sets the window-open handler.
- Transfer's two pages prevent `dragover` and `drop` at the document level; the message list keeps its own handler for sending files. The dimming windows' page has no script; a drop on one is held by the navigation guard alone.
- Every IPC handler is registered through one wrapper, which hands Electron the handler wrapped in the sender check; the check is a pure function that refuses a call before the handler runs. Static checks keep every way of registering for a page's messages (`ipcMain`, a web contents' `ipc` object, its IPC message events) out of the rest of the main process, and require each registration in the wrapper's own module to go through the check.
- The quarantine is applied to the partial file, after it is complete and its hash checked, and before it is renamed to its final name, by the system's `xattr` tool; the value names Transfer and a fresh event identifier, in the form browsers use.

## Testing Decisions

- The origin rule, the permission decision, the IPC sender decision and the check around each IPC handler are pure functions with unit tests: over their bypass vectors (an origin that only starts like Transfer's, another scheme, a different host or port, userinfo, mixed case, unparsable input), and, for the check, that a refused call — a subframe, another page, a frame that is gone — never runs its handler.
- The wiring is held by e2e cases in quiet instances from source: a navigation away from Transfer's page is cancelled and the page keeps working; a new window is denied; a drop outside any drop target is taken by the page while a drop target still receives one; clipboard writing is allowed while a permission request and a permission check are denied; a page that is not Transfer's, loaded with Transfer's preload into a window of its own, gets an error from IPC; the main window runs sandboxed. The screenshot overlay exists only after a real capture, so that it still copies a colour and works sandboxed is checked by hand on a production build.
- Static checks hold what has no runtime trigger: no window switches its sandbox off or Node integration on; no IPC registration bypasses the wrapper; Transfer's own renderer code has no raw-markup or embedding sink.
- The quarantine value is a pure function with unit tests. That the step runs on the complete partial file before the rename, and that a cancelled or corrupted transfer leaves nothing behind, are unit tests of the receive step. The attribute on a received file is held by the transfer integration test on macOS. That a file carrying Transfer's value gets the first-launch check is checked by hand: a script and a document carrying it, opened beside an unquarantined copy. The Mac App Store build, where a sandboxed app runs the tool, is not measured by any test; it is checked by hand on a received file before a Mac App Store submission.
- An unhandled drop's own navigation is not measured: it needs a real drag on screen. The two layers that stop it do not depend on it.

## Out of Scope

- Windows' equivalent of quarantine (the Mark of the Web on received files).
- A CSP delivered by response headers: the pages carry one in a `<meta>` element, and no page from elsewhere is ever loaded.
- Launch inputs and fuses: electron-security is the general baseline; launch inputs are [mac-distribution](mac-distribution.md) mac-distribution::CON-006 and mac-distribution::CON-007.

## Further Notes

- The checklist itself, with its criteria and versions, is electron-scaffold's `electron-security.md`; the ledger records Transfer's state against it, not the criteria.
