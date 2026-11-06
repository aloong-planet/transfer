# Electron security ledger

Transfer's state against electron-scaffold's security checklist (`electron-security.md`: the official 20 items plus item 21). The criteria live in that checklist; this page records only Transfer's status, what holds it, and why where an item is not done. Requirements: [specs/electron-security.md](../specs/electron-security.md) and [specs/mac-distribution.md](../specs/mac-distribution.md) mac-distribution::CON-006/CON-007. Decisions: ADR-0024, ADR-0025.

**Update this page** in the same change whenever one of these happens: a window, session, protocol or IPC handler is added or reconfigured; the main process reads a new launch argument or variable; Electron's major version changes; a packaging platform is added; or Transfer starts rendering content from elsewhere.

Last full pass: 2026-11-06, Electron 35.7.5.

| # | Item | Status | Held by |
|---|---|---|---|
| 1 | Only secure content | Not applicable: no window loads remote content; pages come from `app://bundle` (packaged) or the local dev server (from source). Peer traffic is HTTPS with fingerprint pinning (ADR-0004), outside the renderer | — |
| 2 | No Node integration for remote content | Done: `nodeIntegration: false` on every window | Static case in `src/main/security.test.ts` (no `nodeIntegration: true` in `src/main`) |
| 3 | Context isolation | Done: `contextIsolation: true` on every window | Explicit in each `webPreferences` |
| 4 | Sandbox | Done: every renderer sandboxed — main window, screenshot overlay, and the dimming windows (sandboxed by default) | e2e `e2e/electron-security.spec.ts` (main window); static case (no `sandbox: false` in `src/main`); the overlay by hand on a real package (it is created only by a real capture) |
| 5 | Permission requests | Done: the default session grants clipboard writing to Transfer's own pages and denies every other request and check | Unit cases (`permissionGranted`); e2e: clipboard write allowed, a notification request denied |
| 6 | `webSecurity` not disabled | Done: never set | Search of `src/main` |
| 7 | Content Security Policy | Done by `<meta>` on both pages: `script-src 'self'`, no remote sources. Not delivered by response header: no page from elsewhere is ever loaded (spec, Out of Scope) | `src/renderer/index.html`, `src/renderer/overlay.html` |
| 8 | `allowRunningInsecureContent` off | Done: never set | Search of `src/main` |
| 9 | `experimentalFeatures` off | Done: never set | Search of `src/main` |
| 10 | No `enableBlinkFeatures` | Done: never set | Search of `src/main` |
| 11 | `<webview>` without `allowpopups` | Not applicable: Transfer uses no webview | — |
| 12 | Validate `<webview>` options | Done defensively: every web contents prevents `will-attach-webview` | `installWebGuards` (`src/main/web-guards.ts`) |
| 13 | Limit navigation | Done: `will-navigate` and `will-frame-navigate` on every web contents cancel any navigation to an origin other than Transfer's own, compared after parsing; both pages also take any drop outside a drop target | Unit cases (`isAppUrl` and its bypass vectors); e2e: a page-started navigation is cancelled, a stray drop is taken by the page. A real drop from the desktop is not measured (needs an on-screen drag; neither guard depends on it) |
| 14 | Limit new windows | Done: every web contents' window-open handler denies | e2e: `window.open` creates no window |
| 15 | `openExternal` only with checked URLs | Done: one call, with a constant `x-apple.systempreferences:` URL | `src/main/screenshot-service.ts` |
| 16 | Current Electron | **Known risk, recorded**: Transfer runs 35.7.5; the latest stable on 2026-11-06 is 45.2.3. Electron supports the latest three majors only, so 35 receives no security backports. Upgrading is a separate decision (the owner's). Items it lowers here: #19 asar integrity is experimental below 39 and has no digest below 41; #5's `fileSystem` permission type arrives in 43 (deny-all is unaffected); `npm install --ignore-scripts` for the `electron` package arrives in 42 | — |
| 17 | IPC sender validation | Done: every handler is registered through one wrapper that answers only a main frame on Transfer's own origin | Unit cases (`isTrustedSender`); static case (no `ipcMain.handle(` outside `web-guards.ts`); e2e: a foreign page in the window gets no answer |
| 18 | Custom protocol instead of `file://` | Done: `app://bundle`, privileged, mapped to the renderer build with a traversal guard (ADR-0007) | `src/main/app-protocol.test.ts` |
| 19 | Fuses | Done as ADR-0024 sets them: Node's entries off, the app loads only from its integrity-checked `app.asar` (experimental on Electron 35), no extra `file://` privileges, cookie encryption off (no cookies; one-way) | Fuse wire read from built binaries ([mac-signing.md](mac-signing.md), Launch inputs); config guard in `src/shared/mac-packaging.test.ts` |
| 20 | Preload exposes no raw Electron API | Done: wrapper functions only; event callbacks drop the `IpcRendererEvent` | `src/preload/index.ts` |
| 21 | A packaged build refuses launch inputs | Done (ADR-0024) | Unit cases (`src/main/launch-inputs.test.ts`); the packaging check on every macOS Developer ID build; by hand on the Mac App Store and Windows builds ([mac-signing.md](mac-signing.md), Launch inputs) |

Related, outside the checklist: received files are quarantined on macOS (electron-security::REQ-001), held by unit cases (`src/main/transfer/quarantine.test.ts`) and the transfer integration test, which reads the attribute back on macOS.
