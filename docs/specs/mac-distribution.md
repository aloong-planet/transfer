# macOS distribution (Developer ID / DMG)

> Related: no features entry (distribution channels are not in the feature catalogue) · ADR-0010 · ADR-0023 · ADR-0024 · [ops/mac-signing.md](../ops/mac-signing.md)

## Problem Statement

Transfer ships three macOS DMGs (arm64, x64, universal) outside the App Store. A DMG that is not notarized, or whose app carries no stapled ticket, is blocked or flagged by Gatekeeper on the user's machine — and every way of producing such a build has looked green at the time: an unsigned CI artifact when the certificate secret was missing, a local build on a machine without the certificate, a prerelease that was signed but never notarized. Packaging commands named after mechanisms (`sign`, `package-signed`) also stopped matching what they do, so nobody could tell from a name whether a build would be notarized.

A signed build is also what macOS trusts: what the user has granted Transfer, such as screen recording, belongs to whatever runs inside it. Whoever can start Transfer could steer a packaged build through its launch inputs. Measured on a notarized v1.2.1, `--remote-debugging-port` opened a port that listed the app's own page, and `ELECTRON_RENDERER_URL` loaded any URL into the window with every method of the preload; the build read four `TRANSFER_*` test seams, and Node's own entries (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect`) were left on.

## Solution

Every packaged macOS build is signed with Developer ID; without the certificate, packaging fails instead of producing anything. Builds that are published — formal releases and prereleases alike — notarize and staple both each `.app` and each DMG and pass the full gate before upload. Local packaging signs only, with notarization switched off explicitly. Two entry commands named after their environment run one builder call each; the release one notarizes each `.app` from a hook inside that call and gates the DMGs after it. Dev mode neither signs nor notarizes.

Every packaged build — macOS Developer ID, Mac App Store and Windows — refuses, before it loads anything, a launch that carries any argument other than `--user-data-dir`, the development server's URL or a `TRANSFER_*` test seam, and Node's entries are switched off in the build itself. Each macOS Developer ID packaging launches the built app to prove the refusal, and that a plain launch still opens. A run from source keeps its seams.

## User Stories

### mac-distribution::US-001 Publish a formal release

As the publisher, I want a clean version tag to produce notarized DMGs for every architecture, so that users can open the download and the app it contains on any Mac, even offline.

- mac-distribution::US-001/AC-01: On a clean `v*` tag, the macOS job runs the release command: each architecture's `.app` is notarized and stapled before its DMG is built, and each DMG is then signed, notarized, stapled and passes the full gate (mac-distribution::REQ-005).
- mac-distribution::US-001/AC-02: The DMGs are published to the GitHub Release marked Latest, and synced to R2 with `latest.json` updated last, only after every architecture has passed the gate and the Windows job has succeeded.

### mac-distribution::US-002 Publish a prerelease

As the publisher, I want a prerelease tag to be packaged exactly like a formal release, so that testers get the same notarized build the formal release will be.

- mac-distribution::US-002/AC-01: On a `v*` tag ending in `-beta`, `-rc`, `-alpha` or `-dev`, the macOS job runs the same release command and gate as mac-distribution::US-001/AC-01.
- mac-distribution::US-002/AC-02: The DMGs are published to the GitHub Release marked Pre-release; R2 and `latest.json` are not touched.

### mac-distribution::US-003 Verify the release path without publishing

As a maintainer, I want to run the full release packaging from a manual CI run, so that I can prove notarization works before tagging.

- mac-distribution::US-003/AC-01: A manual run with `verify_formal_macos` checked runs the release command and the full gate.
- mac-distribution::US-003/AC-02: That run uploads only an Actions artifact: it creates no GitHub Release and does not touch R2 or `latest.json`.

### mac-distribution::US-004 Package from CI without releasing

As a maintainer, I want a manual CI run without the verification switch to give me a signed build, so that I can try a build from CI without waiting for Apple.

- mac-distribution::US-004/AC-01: A manual run without `verify_formal_macos` runs the local command: each DMG and the app inside it carry a Developer ID signature, and nothing is submitted to Apple, even though the Apple credentials exist as secrets.
- mac-distribution::US-004/AC-02: That run uploads only an Actions artifact, as in mac-distribution::US-003/AC-02.

### mac-distribution::US-005 Package locally

As a developer, I want one command that packages a signed build on my machine, so that I can install and run it like a user would.

- mac-distribution::US-005/AC-01: `dist:mac:local` on a machine with a valid Developer ID Application identity produces one DMG per configured architecture; each DMG and its app carry a Developer ID signature, and `codesign --verify --deep --strict` passes on each app.
- mac-distribution::US-005/AC-02: Nothing is submitted to Apple, including when the Apple credentials are loaded into the environment.

### mac-distribution::US-006 Run the release packaging locally

As the publisher, I want to run the release packaging on my own machine, so that I can reproduce or investigate a release without CI.

- mac-distribution::US-006/AC-01: With the Apple credentials loaded from the uncommitted local env file, `dist:mac:release` produces the same notarized, stapled and gated artifacts as the CI release path.

## Functional Requirements

### mac-distribution::REQ-001 No certificate, no package

Packaging without the Developer ID certificate fails instead of producing an unsigned or ad-hoc-signed build.

- mac-distribution::REQ-001/AC-01: Locally, when the keychain holds no valid Developer ID Application identity, `dist:mac:local` and `dist:mac:release` fail before building, and the message says to install the certificate and how to list identities that are present but untrusted.
- mac-distribution::REQ-001/AC-02: In CI, when the `CSC_LINK` secret is missing, the macOS job fails in every tier (tag, manual verification, manual packaging) with a message to configure the secret; no unsigned artifact is produced or uploaded.
- mac-distribution::REQ-001/AC-03: Whatever the certificate source, signing is confirmed on the built apps and DMGs, not assumed from the build: a build whose app is not signed by a Developer ID Application identity fails the packaging command, so nothing from it is uploaded.

### mac-distribution::REQ-002 Release requires every Apple credential

- mac-distribution::REQ-002/AC-01: In CI, a release-tier run (tag or manual verification) missing any of `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` or `APPLE_TEAM_ID` fails before packaging starts.
- mac-distribution::REQ-002/AC-02: The release packaging checks all three credentials before it builds, and the app notarization hook and the DMG gate refuse to run without them, failing with the missing names; nothing ever skips.

### mac-distribution::REQ-003 The architecture set comes from the builder config (direct acceptance)

Packaging works on exactly the architectures listed for the macOS DMG target in the builder config. Build output left by an earlier run is cleared before the build, so a leftover app never reaches Apple; a missing or extra architecture in this build's output fails the packaging, and nothing is uploaded.

### mac-distribution::REQ-004 Notarization logs belong to the artifacts they describe

- mac-distribution::REQ-004/AC-01: Each accepted `.app` and DMG submission saves its Apple log, unmodified, next to the version's artifacts, and the CI artifact upload includes them.
- mac-distribution::REQ-004/AC-02: Rebuilding an app or a DMG removes any log a previous run left for it, so a locally packaged DMG never sits next to a log that claims it was notarized.

### mac-distribution::REQ-005 The release gate (direct acceptance)

Before upload, each DMG passes: the expected-set check; image verification, signature verification and a signature-content check (Developer ID Application, the expected Team ID, a secure timestamp) before submission; an Accepted submission whose log matches the submission, is Accepted and has no error-level issue; staple and validate; image verification again; Gatekeeper assessment of the DMG; and, inside the read-only mounted image, exactly one `Transfer.app` that passes strict deep verification and carries its own stapled ticket. Failure diagnostics never replace the original error, and the image is always detached.

### mac-distribution::REQ-006 The packaging proves the refusal

Applies to: every macOS Developer ID packaging, in either profile, locally and in CI. What is refused is defined in mac-distribution::CON-006.

- mac-distribution::REQ-006/AC-01: The packaging launches each built app this machine can run with each input it tries to refuse — every launch with its own temporary settings directory and none of the signing or Apple credentials — and fails unless each launch ends with exit code 64 and the program that a switch names did not run.
- mac-distribution::REQ-006/AC-02: It then launches each such app with only a temporary settings directory, and fails if the app exits within the observation window.
- mac-distribution::REQ-006/AC-03: An app built for an architecture this machine cannot run is reported and skipped; when none can run, the packaging fails.

## Constraints

### mac-distribution::CON-001 Command names (direct acceptance)

Applies to: `package.json` scripts. The entry commands are `dist:mac:local` (local packaging) and `dist:mac:release` (release packaging, then the DMG gate). The previous names (`dist:mac`, `dist:mac:package-signed`, `notarize:mac:dmgs`, `dist:mac:sign`, `mac:notarize-dmg`) are removed without aliases.

### mac-distribution::CON-002 Built-in notarization is off (direct acceptance)

Applies to: the builder config and every builder invocation in the packaging script. The builder config sets macOS notarization off permanently, so loaded Apple credentials never trigger a submission; every invocation also passes the off switch on the command line, so the local path stays safe even if the config is edited.

### mac-distribution::CON-003 Fixed order, no change after staple (direct acceptance)

Applies to: the release path. The app is notarized and stapled before its DMG is built; the DMG is built from that app without re-signing it; nothing modifies an app or DMG after it is stapled; every signature and notarization finishes before upload.

### mac-distribution::CON-004 Publishing follows the tag event (direct acceptance)

Applies to: the build workflow. Steps that create a GitHub Release run only on a tag event; the Pre-release marking follows the tag suffix; the R2 sync runs only on a clean tag and only after both platform jobs succeed. The manual verification switch never grants publishing.

### mac-distribution::CON-005 Unchanged neighbours (direct acceptance)

Applies to: the Windows job, the Mac App Store scripts and dev mode. Windows packaging and publishing, `dist:mas` / `dist:mas:dev` / `pkg:mas`, and `pnpm dev` are untouched by the signing and notarization policy above; dev mode neither signs nor notarizes. The Windows and Mac App Store builds do share mac-distribution::CON-006 and mac-distribution::CON-007, which apply to every packaged build.

### mac-distribution::CON-006 A packaged build refuses launch inputs

Applies to: every packaged build — macOS Developer ID in both profiles, the Mac App Store build, and the Windows installer and portable builds. The decision and what was rejected are in ADR-0024.

- mac-distribution::CON-006/AC-01: A launch carrying any argument after the executable other than `--user-data-dir=<directory>` exits with code 64 before anything loads — whether the argument is a switch or not, known or not, and however it is spelled. The `-psn_` token that older macOS versions passed to every launch is the one other argument accepted.
- mac-distribution::CON-006/AC-02: A launch whose environment holds `ELECTRON_RENDERER_URL`, whatever its value (empty included), or any variable whose name starts with `TRANSFER_`, exits the same way. Names are compared without regard to letter case, because Windows reads variable names that way.
- mac-distribution::CON-006/AC-03: The refusal is one line on standard error naming the refused inputs in order — the arguments, then the variables — with no value: a switch by its name, any other argument by a placeholder, since it can be a path. Nothing is shown: no window and no dialog.
- mac-distribution::CON-006/AC-04: A launch with neither opens as it always has: with no arguments (Finder, the Dock, `open`, a Windows shortcut), and with only `--user-data-dir`, which keeps everything Transfer stores in its data directory in the directory named.
- mac-distribution::CON-006/AC-05: A run from source is not affected: it still takes `ELECTRON_RENDERER_URL` and the `TRANSFER_*` seams, so development, e2e and smoke runs work as before.

### mac-distribution::CON-007 Node's entries are closed in every shipped build (direct acceptance)

Applies to: the same builds as mac-distribution::CON-006. Read from each built Electron binary, not from the config: `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` are disabled, so `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` reach nothing — Node reads them before the main module runs, where mac-distribution::CON-006 cannot act. The other fuses are as ADR-0024 sets them: `onlyLoadAppFromAsar` and `enableEmbeddedAsarIntegrityValidation` enabled; `grantFileProtocolExtraPrivileges`, `enableCookieEncryption` and `loadBrowserProcessSpecificV8Snapshot` disabled.

## Failure modes and boundaries

### Developer, local packaging

- No valid Developer ID identity in the keychain: fails before building (mac-distribution::REQ-001/AC-01). An identity that is present but untrusted (for example a missing intermediate certificate) counts as missing; the message shows how to list it.
- The build silently signs nothing or signs with another identity: caught on the built apps before any DMG (mac-distribution::REQ-001/AC-03).
- Apple credentials loaded in the shell while running `dist:mac:local`: still nothing is submitted (mac-distribution::US-005/AC-02, mac-distribution::CON-002).
- A leftover from an earlier or crashed run (an app in a stale `mac-*` directory, a DMG, a log): cleared before the build; an architecture missing or extra in this build's output fails the packaging (mac-distribution::REQ-003).
- `dist:mac:local` run after a release run of the same version: the DMGs are rebuilt unnotarized and the earlier logs for them are removed (mac-distribution::REQ-004/AC-02).
- Interrupted run (Ctrl-C, crash) leaves a partial version directory: the next run rebuilds every app and DMG; a leftover file outside the expected set fails the gate rather than being published.
- The built app does not refuse an input, or refuses everything: the packaging command fails after the builder call — in release, before the DMG gate — so nothing is uploaded; the failure names the input or the plain launch (mac-distribution::REQ-006/AC-01–02).
- A local packaging runs the built app for a few seconds with only a temporary settings directory, once per app this machine can run (on Apple silicon: universal and arm64). Each time a Transfer window opens, and the app announces itself on the LAN as a device nobody has seen before, which other devices keep listing, offline, for their offline-keep time (60 minutes by default). Whether F1 stays with an installed copy that is running meanwhile has not been measured. This is the one automated launch exempt from keeping announce off (ADR-0024); CI runners reach no other device.

### Whoever can start a packaged build

- A Chromium switch, known or not (`--remote-debugging-port`, `--remote-debugging-pipe`, `--gpu-launcher=<program>`, `--js-flags`, a made-up name), in any spelling Chromium would read — one dash or two, a slash on Windows, any letter case: exit 64 before anything loads; no port opens and no named program runs (mac-distribution::CON-006/AC-01). The guard does not need to know which spellings Chromium reads, since it accepts only the exact form of the one switch it allows.
- A spelling that only resembles the accepted switch (`--USER-DATA-DIR=…`, `-user-data-dir=…`, `--user-data-dir-x=…`, `--user-data-dir` with no `=`): refused (mac-distribution::CON-006/AC-01).
- `--user-data-dir=<directory>` beside a refused input, before or after it: refused; the accepted argument does not shield the other (mac-distribution::CON-006/AC-01).
- An argument that is not a switch, such as a file path: refused; Transfer takes nothing from its command line. On Windows, dropping a file onto Transfer's executable therefore no longer opens it (mac-distribution::CON-006/AC-01).
- `--type=` with an empty value reaches the main process like any launch: refused. `--type=<process type>` is read by Chromium before any JavaScript and never reaches the guard; started by hand it crashes with or without the guard and opens nothing (ADR-0024).
- `ELECTRON_RENDERER_URL` with any value, or a `TRANSFER_*` variable — including one no code reads yet, and on Windows one spelled in lower case, which the code would still read: refused (mac-distribution::CON-006/AC-02). `TRANSFER_USERDATA` and `TRANSFER_PORT` therefore no longer work on an installed copy; `--user-data-dir` still does, and a second copy on the same machine takes the next free port by itself.
- `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect`: closed by the fuses, before the guard could see them (mac-distribution::CON-007).
- A refused launch while an installed copy is running: it exits before the single-instance lock, so the running copy is neither focused nor told.
- The refusal's message never carries a value, since a value can hold a path or a URL that is nobody's business (mac-distribution::CON-006/AC-03).
- Launching the executable through a symlink, or a copy of the whole bundle elsewhere: still a packaged build, still refused. A copy whose executable is renamed may read as unpackaged, but its signature no longer holds, so it is not the app macOS trusts.

### Users and testers

- Opening Transfer from Finder, the Dock, `open`, Spotlight or a Windows shortcut passes no argument: it opens as before (mac-distribution::CON-006/AC-04). On macOS 26, `open` passes only the arguments it is given.
- A Windows portable build is started through its launcher, which passes on the arguments it was given: the same rule applies to them.
- A tester who wants a second copy on one machine runs one from source, or starts an installed copy with `--user-data-dir=<directory>`; the seams that did this before are refused on an installed copy.

### Publisher, release packaging (CI or local)

- A release-tier CI run missing a credential: fails before packaging (mac-distribution::REQ-002/AC-01). Run locally without the credentials: `dist:mac:release` fails with the missing names before building (mac-distribution::REQ-002/AC-02).
- Apple rejects an app: the hook fetches the log for diagnosis and fails the build with the original rejection; that architecture's DMG is never built and nothing is uploaded.
- One architecture's app or DMG fails after another succeeded: the whole run fails and nothing is uploaded; the accepted submissions remain only as Apple-side records.
- Apple network error or timeout during submission: the step fails; rerunning the workflow repeats the whole release path.
- DMG-level failures (signature content, submission, log, staple, Gatekeeper, mounted app): as in mac-distribution::REQ-005; nothing is uploaded.
- Upload or Release creation fails after the gate passed: the job fails and the R2 sync does not run; rerunning is safe because nothing was published.
- R2 upload fails: the GitHub Release already exists; installers go up before `latest.json`, so a rerun of the sync recovers.

### Tag shapes

- A clean tag and a prerelease tag run identical macOS packaging; only the Release marking and the R2 sync differ (mac-distribution::US-001, mac-distribution::US-002).
- A `v*` tag with a suffix other than the four listed is treated as a formal release (existing behaviour, unchanged).

### Users installing

- From a formal release or a prerelease: the DMG opens without a Gatekeeper rejection, and the app dragged out of it starts offline because it carries its own ticket. Prereleases no longer need the quarantine attribute removed by hand.

## Implementation Decisions

- One builder call per packaging builds and signs every configured architecture's app and DMG — the builder's ordinary path, so everything it does inside a single build still happens (it writes `app-update.yml` into each app only when the same call also builds a DMG or zip). Built-in notarization stays off in both profiles (ADR-0023).
- Before building, the packaging script checks for a certificate source — a valid Developer ID Application identity in the keychain, or the `CSC_LINK` secret in CI, which the builder imports itself — and, in release, for all three Apple credentials; it then clears this build's earlier output.
- The release profile adds the packaging script as the builder's afterSign hook. The builder calls it once per final app, after signing and before that architecture's DMG; it submits the app as a zip archive, applies the same Accepted-submission and log checks as the DMG gate, keeps the log, staples the app and validates the staple. A universal build's per-architecture intermediates are built unsigned, so they never reach the hook.
- After the build, the script locates each app by its binary's architectures (not by guessing directory names: `--x64` and the other architectures build into differently named directories), asserts its signature authority and strict deep verification, in release its stapled ticket, and checks each DMG's signature content against the app's team, because DMG signing writes no log line.
- The DMG gate is a subcommand of the same packaging script, driven by the configured architecture set; the release entry runs it after the build. It expects exactly one DMG per architecture, named after the product, version and architecture, and the script refuses a builder config whose DMG name pattern says otherwise.
- The packaging script and its tests are the electron-scaffold skill's asset, copied into the project unchanged; Transfer keeps no fork of it. A change the project needs goes into the asset first and is then copied back.
- The CI macOS job chooses the release command for any `v*` tag and for a manual run with the verification switch, and the local command otherwise; a missing certificate secret fails the job in every tier.
- The launch guard is the main module's first import, so it decides while the main module loads: before the app name is set, the `app://` scheme is registered, the single-instance lock is taken, or any other module's top-level code runs. It exits through the app with code 64, the contract with the packaging check. Its decision is a pure function of whether the build is packaged, the arguments after the executable and the environment.
- The guard does not model how Chromium reads an argument: every argument after the executable must be exactly an accepted one — `--user-data-dir=` followed by its value, or the `-psn_` token — and anything else is refused, switch or not. Seams are recognised by their `TRANSFER_` prefix, so a new seam is refused without touching the guard; variable names are compared without regard to case on every platform.
- The fuses are set in the builder config, which writes them into each platform's Electron binary before it is signed.

## Testing Decisions

- Good tests assert behaviour through an injected command runner: which commands run in which order, what fails and with which message, and that cleanup happens — never that Apple was reached. The unit seam is the packaging script's exported functions; those tests ship with the script as part of the same asset and run under Node's test runner in the project's test command.
- The project's own tests cover only what is Transfer's: that its builder config satisfies the packaging script, and what the package scripts run.
- The workflow and `package.json` are covered by static tests as a regression guard; they do not replace a real run.
- The certificate checks, signature assertions and both entry commands are verified by real runs: `dist:mac:local` with and without an identity, and the release path once (locally with the credentials, or a manual CI run with the verification switch).
- Unit tests that use a fake runner say in the test file that they never contacted Apple.
- The guard's decision is unit tested through its pure function, over its bypass vectors. The guard's wiring runs only in a packaged build, which no unit or e2e test starts: the packaging check holds its exit code on the built macOS app at every packaging (mac-distribution::REQ-006), and the message, the Mac App Store build and the Windows builds are checked by hand on real packages, as the runbook describes. Its place as the main module's first statement is pinned by a static check of the source; that it then decides before the debugging port and the single-instance lock is measured on real packages.
- The fuses are verified by reading the fuse wire of each built Electron binary; a correct config alone proves nothing.
- The e2e suite is the regression guard for mac-distribution::CON-006/AC-05: it runs from source through the seams the guard refuses in a package. One e2e case starts Transfer with only `--user-data-dir`, without the seam that would otherwise put the data in the same place, to hold the storage clause of mac-distribution::CON-006/AC-04.

## Out of Scope

- The Mac App Store line: separate identities and profiles, sandboxed, not notarized (see [ops/mas-submission.md](../ops/mas-submission.md)). Only mac-distribution::CON-006 and mac-distribution::CON-007 apply to it.
- A quiet mode, or any other test-only input, for an installed copy: an accepted seam is a launch input like any other (ADR-0024).
- A packaging check of the refusal for the Mac App Store and Windows builds: the packaging asset covers macOS Developer ID builds only.
- Windows code signing.
- Changing which tag suffixes count as prereleases.
- A partial release (publishing the architectures that passed when another failed).
- Release notes; their macOS section follows the cross-project release rules.

## Further Notes

- Notarization waits on Apple (minutes to tens of minutes per submission), and every architecture submits twice (app and DMG), so prerelease CI now takes as long as a formal release; ADR-0023 records this trade-off.
