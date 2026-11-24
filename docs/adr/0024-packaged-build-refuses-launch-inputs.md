# ADR-0024: A packaged build refuses every launch input outside an allow-list, and the fuses close Node's entries

- Status: Accepted (2026-11-06)

## Context

macOS trusts a signed build, so what the user granted Transfer belongs to whatever runs inside it. Every build read `ELECTRON_RENDERER_URL` and four `TRANSFER_*` test seams and nothing inspected the command line, so a launch could open a debugging port or load any URL, and the fuses behind `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` were on.

## Options

1. **Refuse the whole launch (exit 64) on anything outside an allow-list of launch inputs; close Node's entries with the fuses; and have every macOS Developer ID packaging launch the built app to prove the refusal and that a plain launch opens**
2. Allow-list switch names by their leading characters — rejected: the guard would have to follow how Chromium reads an argument on every platform and version, and any difference is a way past it.
3. Remove unwanted switches with `app.commandLine.removeSwitch` — rejected: a switch read before the main module runs cannot be undone (as measured in Agentshed).
4. A deny-list of known switches — rejected: it stops only what someone has already found, and `--gpu-launcher` was found by trying more switches.
5. Gate each seam where it is read, with `app.isPackaged` — rejected: the reads sit in several modules, so a new seam would stay open until someone remembered the gate.
6. A dialog on refusal — rejected: nobody reaches the refusal by opening the app, and it would let a launcher put a dialog on screen in Transfer's name.
7. A quiet mode accepted in packaged builds — rejected: an accepted seam is a launch input, which this decision closes, and the packaging check's plain launch exists to prove the path a user takes.
8. Leave it, since whoever can start the app already runs as the user — rejected: they do not hold what the user granted Transfer, and the fuses close the same kind of door for Node.

## Decision

We choose **option 1**, as mac-distribution::CON-006, CON-007 and REQ-006 state it: a packaged build (macOS Developer ID, Mac App Store, Windows) exits with code 64 before anything loads on any launch outside the allow-list (`--user-data-dir=<directory>` and the `-psn_` token, no `ELECTRON_RENDERER_URL`, no `TRANSFER_*`), and a run from source is unaffected. The exit code is the contract with the packaging check, so a crash never passes for a refusal.

The fuses `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` are disabled, since Node reads them before any guard runs. `onlyLoadAppFromAsar` and `enableEmbeddedAsarIntegrityValidation` are enabled, so code loads only from `app.asar`, checked against the hash recorded at packaging, on macOS and on Windows (experimental in Electron 35). `grantFileProtocolExtraPrivileges` is disabled because pages load from `app://` (ADR-0007). `enableCookieEncryption` stays disabled, as Transfer sets no cookies and Electron documents it as one-way, and so does `loadBrowserProcessSpecificV8Snapshot`.

## Consequences

- Positive: Untried switches are closed too, whatever a platform makes of their spelling, and a new `TRANSFER_*` seam is refused without another line in the guard.
- Negative: An installed copy can no longer be driven through a debugging port or given test seams: `TRANSFER_USERDATA` and `TRANSFER_PORT` stop working, while `--user-data-dir` still separates a second copy's data and the port falls back to the next free one. A check on a real package shows only its exit, window and files.
- Negative: `--enable-logging` and the like no longer work on an installed copy, so diagnosing one means a build of its tag.
- Negative: A local packaging launches the built app once per app the machine can run: a window appears and the app announces itself as a device nobody has seen, which other devices list, offline, for their offline-keep time. It is the one automated launch that may announce (`AGENTS.md`, Invariants), and whether F1 stays with an installed copy running meanwhile has not been measured.
- Negative: On Windows, dropping a file onto Transfer's executable no longer opens it, since the file's path is an argument; Transfer never used it.
- Negative: If a future operating system added an argument to every launch, Transfer would refuse to open and the packaging check would not show it, because it starts the process directly. A launch through `open` belongs in checking a package by hand on a new macOS version.
- Neutral: `--type` naming a process type is read by Chromium before any JavaScript, so it gets no exit 64; it crashes the same with or without the guard and opens nothing.

## Sources

- Spec: [mac-distribution](../specs/mac-distribution.md) mac-distribution::CON-006, mac-distribution::CON-007, mac-distribution::REQ-006.
- Measured on the notarized v1.2.1 (macOS 26, Electron 35, Chromium 134): a debugging port and an arbitrary URL were both accepted.
- aloong-planet/agentshed ADR-0042; Chromium `base/command_line.cc`; electron-scaffold's `electron-security.md` items 19 and 21 and `macos-signing.md` section 6.
