# ADR-0022: The receive folder is user-selectable and falls back to the default, forgetting the old path, when it fails

- Status: Accepted (2026-08-23)

## Context

Received files always land in the system Downloads folder, which the user cannot change: browsers pile their downloads there, and a dedicated folder on an external disk or NAS goes unused. The Mac App Store rejected the app under Guideline 2.4.5(i) on two counts, that it stores user data inside the app container and that the `files.downloads.read-write` entitlement has no visible feature. In the sandbox the container's `Downloads` is a symlink to the real `~/Downloads`, but `app.getPath('downloads')` returns the container path and Settings showed that path as it was.

## Options

1. **A user-selectable receive folder that defaults to the system Downloads folder, shows a path with symlinks resolved, and falls back to the default, forgetting the old path, when it fails**
2. Ask the user to choose a folder at first launch, so that the downloads entitlement is not needed at all — rejected: it is the pattern Apple prefers, but it turns out-of-the-box use into configuration, and most people would pick Downloads anyway.
3. Fix only the displayed path and answer the second rejection point by appeal — rejected: it is the smallest change, but an appeal of the same kind (`network.server`) failed.
4. Move existing files automatically when the folder changes — rejected: it must handle long copies of large files, failures midway and copies across volumes, and users may already refer to those files elsewhere.
5. Remember the path from before a failure so the folder can be restored when it returns — rejected: it is kinder, but it creates a "chosen but unusable" state, and the receive folder would change back by itself.

## Decision

We choose **option 1**.

- The receive folder is the user's choice and defaults to the system Downloads folder, with no first-launch prompt. The `files.downloads.read-write` entitlement stays as the basis of that default and is not removed to pass review, since without it the default folder could not be written.
- The displayed path resolves symlinks and the path written to does not: both reach the same place, and resolving the written path only adds authorisation variables in the sandbox.
- A folder that has failed, by being deleted, renamed, losing its disk or failing to resolve its sandbox authorisation, is replaced by the default and the old path is not kept. The four causes are not told apart, since a failed resolution cannot tell its cause and distinguishing them would create a branch that cannot be tested; the user is told through a persisted flag, cleared when the user dismisses the notice or chooses a folder again.
- The fallback is decided after a re-check, never on a single failed probe, so that a transient failure does not discard the user's choice; the timing is in `docs/specs/receive-dir.md`.
- Changing the folder, restoring the default and dismissing the notice take effect at once, and Cancel does not undo them, since choosing a folder is a heavy modal action and a notice already read should not come back.
- Developer ID builds and Mac App Store builds behave alike, so the user need not know which one is installed; only the sandboxed build stores a security-scoped bookmark.

## Consequences

- Positive: A file is never lost to a stale setting, and the model has only two states, the default and one chosen folder.
- Negative: The notice cannot name the folder that failed, and a replugged drive is not switched back to automatically, so the folder must be chosen again.
- Negative: The one-way fallback makes the re-check necessary, and a file that arrives during the re-check lands in the default folder and is not moved when the chosen folder recovers.
- Neutral: Both release lines share one behaviour, so the specs and the tests do not fork by version.

## Sources

- `docs/specs/receive-dir.md`: the behaviour, and its sandbox check, measured on the Mac App Store build on 2026-08-23, that the container's `Downloads` is a symlink to the real `~/Downloads`.
- The App Store review's two points under Guideline 2.4.5(i).
