# ADR-0024: A packaged build refuses every launch input outside an allow-list, and the fuses close Node's entries

- Status: Proposed

## Context

macOS trusts a signed build: what the user has granted Transfer, such as screen recording, and what it can read belong to whatever runs inside it. Transfer's main process read `ELECTRON_RENDERER_URL` and four `TRANSFER_*` test seams in every build, and nothing looked at the command line. Measured on the notarized v1.2.1 (macOS 26, Electron 35, Chromium 134), launched against temporary directories:

| Input | What the build did |
|---|---|
| `--remote-debugging-port=0` | Opened the port, which listed the app's own page as a target |
| `ELECTRON_RENDERER_URL=<url>` | Loaded that URL in the window, and the page found `window.transfer` with its 38 methods |

The same build's fuse wire has `runAsNode`, `nodeOptions` and `nodeCliInspect` enabled, so `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` were open as well; the builder config set no fuses. The same doors were measured on Electron 43 in Agentshed, where `--gpu-launcher=<program>` also ran the program and a switch removed at the top of the main module still took effect (aloong-planet/agentshed, ADR-0042). Chromium's switches are not a published contract, and how Chromium reads an argument differs between platforms: Windows also takes a leading slash and lowercases switch names (`base/command_line.cc`).

## Options

1. **Refuse the whole launch, with exit code 64, when any argument after the executable is not exactly an accepted one (`--user-data-dir=<directory>`, or the `-psn_` token of older macOS launches), or when the environment holds the development server's URL or a `TRANSFER_*` variable, compared without regard to case; close Node's entries with the fuses; and have every macOS Developer ID packaging launch the built app to prove the refusal and that a plain launch still opens** — chosen.
2. Recognise switches by their leading characters and allow-list switch names, as Agentshed's ADR-0042 first did — rejected: the guard would have to follow how Chromium reads an argument, platform by platform and version by version, and any difference between the two is a way past it. Transfer takes no argument of its own, so accepting only whole arguments costs nothing and needs no model of Chromium.
3. Remove the unwanted switches with `app.commandLine.removeSwitch` and carry on — rejected: a switch read before the main module runs cannot be undone (measured in Agentshed with `--js-flags`), so the app would run under an input it believes it removed.
4. A deny-list of known switches — rejected: it stops only what someone has already found; `--gpu-launcher` was found by trying more switches, not from any list.
5. Gate each seam where it is read, with `app.isPackaged` — rejected: the reads sit in several modules, `ELECTRON_RENDERER_URL` alone in four places, and a new seam would stay open until someone remembered the gate.
6. A dialog on refusal — rejected: nobody reaches the refusal by opening the app, so there is no user to tell, and it would give a launcher a way to put a dialog on screen in Transfer's name.
7. Accept a quiet mode in packaged builds, so that the packaging check's plain launch shows no window and announces nothing on the LAN — rejected: an accepted seam is a launch input, the thing this decision closes; and the plain launch exists to prove the path a user takes, window and network included, which a quiet launch skips.
8. Leave it, since whoever can start the app already runs as the user — rejected: they do not hold what the user granted Transfer, and the fuses close the same kind of door for Node.

## Decision

We choose **option 1**. In a packaged build — macOS Developer ID, Mac App Store and Windows — the main process exits with code 64 before anything loads when the launch carries an argument other than `--user-data-dir=<directory>` or the `-psn_` token, or an environment variable named `ELECTRON_RENDERER_URL` or starting with `TRANSFER_`, in any letter case. It names the refused inputs on standard error without any value, and shows nothing. `--user-data-dir` stays because it only moves where Transfer keeps its data and runs nothing, and it lets an installed copy be started without touching the real data. A run from source is not affected, so development, e2e and smoke runs keep their seams. The exit code is the contract with the packaging check, so that a crash never passes for a refusal.

The fuses: `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` are disabled, since Node reads those entries before any guard can run. `onlyLoadAppFromAsar` and `enableEmbeddedAsarIntegrityValidation` are enabled, so the code that runs is the code that was packaged. `grantFileProtocolExtraPrivileges` is disabled: Transfer's pages load from `app://` (ADR-0007), never from `file://`. `enableCookieEncryption` stays disabled: Transfer sets no cookies, so it would protect nothing while bringing in the keychain, an effect on existing data nobody has measured. `loadBrowserProcessSpecificV8Snapshot` stays disabled, as Transfer has no such snapshot.

The refusal is checked on the real package, since a run from source never reaches it: every macOS Developer ID packaging, in either profile, launches the built app with inputs it must refuse and then with only its settings directory, through electron-scaffold's packaging asset.

## Consequences

- Positive: switches nobody has tried yet are closed too, whatever the platform makes of their spelling, and a new seam with the prefix is refused without another line in the guard.
- Positive: `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` reach nothing in a shipped build.
- Negative: an installed copy can no longer be driven through a debugging port or given test seams. `TRANSFER_USERDATA` and `TRANSFER_PORT` stop working on it; `--user-data-dir` still separates a second copy's data, and the port falls back to the next free one by itself. A check on a real package is limited to what its exit, its window and its files show; anything else runs from source or from a build of the tag.
- Negative: `--enable-logging` and the like no longer work on an installed copy, so diagnosing one means a build of its tag.
- Negative: a local packaging launches the built app with only a temporary settings directory, once per app the machine can run: a window appears for a few seconds, and the app announces itself on the LAN as a device nobody has seen, which other devices list, offline, for their offline-keep time. This is the one automated launch exempt from the rule that test instances keep announce off (`CONTEXT.md`, multi-instance coexistence). CI runners reach no other device. Whether F1 stays with an installed copy running meanwhile has not been measured.
- Negative: on Windows, dropping a file onto Transfer's executable no longer opens it, since the file's path is an argument; Transfer never used it.
- Negative: if a future operating system added an argument of its own to every launch, Transfer would refuse to open, and the packaging check would not show it, because it starts the process directly. A launch through `open` is part of checking a package by hand before releasing on a new macOS version.
- Neutral: `--type` naming a process type is read by Chromium before any JavaScript, so it gets no exit 64; it crashes the same with or without the guard and opens nothing, and the packaging check does not try it.
- Neutral: a copy of the bundle with its executable renamed may read as unpackaged, but its signature no longer holds, so it is no longer the app macOS trusts.

## Sources

- Spec: [mac-distribution](../specs/mac-distribution.md) mac-distribution::CON-006, mac-distribution::CON-007, mac-distribution::REQ-006.
- Measurements of v1.2.1 on 2026-11-05 (port and URL launches, fuse wire).
- aloong-planet/agentshed ADR-0042 and its measurements on Electron 43.2.0.
- Chromium `base/command_line.cc` (switch prefixes per platform; Windows lowercases switch names). Node.js documentation of `process.env` (case-insensitive names on Windows).
- electron-scaffold's `electron-security.md` items 19 and 21, and `macos-signing.md` section 6.
