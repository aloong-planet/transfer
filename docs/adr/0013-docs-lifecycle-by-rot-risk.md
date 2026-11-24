# ADR-0013: Documents are governed by how fast their content rots (adopting the harness workflow)

- Status: Accepted (2026-11-25)

## Context

Each feature kept one persistent design document (decisions, file:line facts, plan, progress) and relied on syncing it back after the work to stay true. Several of them carried stale status lines, so the sync cost of persistent working documents is structural. How should the project's documents be governed?

## Options

1. **Classify documents by how fast their content rots, each class with one home and its own lifecycle (see Decision)**
2. Keep one persistent design document per feature and sync it back after the work — rejected: syncing is interest paid continuously, and the most dangerous deviation, a design that describes behaviour since fixed, can be mitigated but never removed.
3. Adopt Matt Pocock's system wholesale (code, tests, `CONTEXT.md` and ADRs, everything else discarded after use) — rejected: it has no room for postmortem and pitfall narratives (such as electron-graceful-quit), the most valuable troubleshooting asset in this repository.
4. Keep terms and invariants together in one glossary at the repository root, as before — rejected: someone changing code reads the glossary by its contents and single entries, so constraints kept in it go unread, while `AGENTS.md` is read in every session, and `docs/` holds every other class of document.
5. Keep ADRs append-only, a changed decision getting a new entry that marks the old one superseded, as before — rejected: the decision in force ends up spread over a chain of entries that a reader must follow, while an entry rewritten in place states what holds now and git keeps the earlier wording.

## Decision

We choose **option 1**: documents are classified by how fast their content rots, and each class has one home.

1. **Decisions (why)** go to `docs/adr/`, one decision per file. An entry states only the decision in force and is rewritten in place, with the user's confirmation, when the decision changes.
2. **Terms** go to `docs/CONTEXT.md`, actively maintained and fed to every new context.
3. **Constraints on whoever changes code** go to the Invariants section of `AGENTS.md`, one line each, with the reason in the ADR, postmortem, spec, gate or code comment that the line points to.
4. **Postmortems and pitfall narratives** go to `docs/` and are kept permanently.

## Consequences

- Positive: Durable assets (ADRs, the glossary, postmortems) hold no fast-rotting implementation detail, so their upkeep trends to zero.
- Neutral: "Syncing back" now means breaking the work down into homes: decisions to ADRs, terms to the glossary, constraints to `AGENTS.md`, pitfalls to postmortems.
- Neutral: The workflow skills are installed in the user's global `~/.claude/skills` (the core ones are local forks of mattpocock/skills, versioned in git), and the repository does not carry them.
- Negative: Every constraint is one more line of `AGENTS.md`, which is read in every session, so the section's length is paid by every task and each line has to stay short with its reason elsewhere.
- Negative: An entry's earlier wording, and the reason it changed, are found only in git history, not in the entry.

## Sources

- Memory note "documents are governed by how fast their content rots"; https://github.com/mattpocock/skills.
- Stale status lines found in two feature design documents: app-scheme-migration still read "pending measurement, then release v0.4.0" when the project was at v0.9.1, and userdata-dirname read "pending" though it was implemented.
- `/domain-modeling`'s CONTEXT-FORMAT (constraints belong in `AGENTS.md`) and the global rule for reading the glossary (contents first, then one entry), on which the rejection in option 4 rests.
