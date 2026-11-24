# ADR-0013: Documents are governed by how fast their content rots (adopting the harness workflow)

- Status: Accepted (2026-11-25)

## Context

Each feature kept one persistent design document (decisions, file:line facts, plan, progress) and relied on syncing it back after the work to stay true. Several of them carried stale status lines, so the sync cost of persistent working documents is structural. How should the project's documents be governed?

## Options

1. **Classify documents by how fast their content rots, each class with one home and its own lifecycle (see Decision)**
2. Keep one persistent design document per feature and sync it back after the work — rejected: syncing is interest paid continuously, and the most dangerous deviation, a design that describes behaviour since fixed, can be mitigated but never removed.
3. Adopt Matt Pocock's system wholesale (code, tests, `CONTEXT.md` and ADRs, everything else discarded after use) — rejected: it has no room for postmortem and pitfall narratives (such as electron-graceful-quit), the most valuable troubleshooting asset in this repository.
4. Keep terms and invariants together in one glossary at the repository root, as before — rejected: someone changing code reads the glossary by its contents and single entries, so constraints kept in it go unread, while `AGENTS.md` is read in every session, and `docs/` holds every other class of document.

## Decision

We choose **option 1**: documents are classified by how fast their content rots, and each class has one home.

1. **Decisions (why)** go to `docs/adr/`, one decision per file.
2. **Terms** go to `docs/CONTEXT.md`.
3. **Constraints on whoever changes code** go to the Invariants section of `AGENTS.md`.
4. **Postmortems and pitfall narratives** go to `docs/` and are kept permanently.

## Consequences

- Positive: Durable assets (ADRs, the glossary, postmortems) hold no fast-rotting implementation detail, so their upkeep trends to zero.
- Neutral: The workflow skills are installed in the user's global `~/.claude/skills` (the core ones are local forks of mattpocock/skills, versioned in git), and the repository does not carry them.
- Negative: Every constraint is one more line of `AGENTS.md`, which is read in every session, so the section's length is paid by every task.

## Sources

- Memory note "documents are governed by how fast their content rots"; https://github.com/mattpocock/skills.
- Stale status lines found in two feature design documents: app-scheme-migration still read "pending measurement, then release v0.4.0" when the project was at v0.9.1, and userdata-dirname read "pending" though it was implemented.
- `/domain-modeling`'s CONTEXT-FORMAT (constraints belong in `AGENTS.md`) and the global rule for reading the glossary (contents first, then one entry), on which the rejection in option 4 rests.
