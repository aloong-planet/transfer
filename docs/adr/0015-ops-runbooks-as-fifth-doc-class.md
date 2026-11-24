# ADR-0015: Operations runbooks are a document class of their own, updated in place

- Status: Accepted (2026-07-27)

## Context

Some documents under `docs/` are neither decisions, terms, constraints nor postmortems: the signing, notarization, Pages, R2 and download-statistics runbooks. They describe how the processes still in use are operated, and are the only place to look when moving machines, replacing a certificate, rebuilding Pages or debugging a failed release, while ADR-0012 records only why notarization fails closed and holds no command. Where should they live, and how are they kept true?

## Options

1. **A class of its own, "operations runbooks", kept permanently and updated in place when the process changes**
2. Treat them as postmortems — rejected: a postmortem is the history of how an incident was investigated, append-only, while a runbook describes the current process and must match it, so a stale one does harm and their lifecycles are opposite.
3. Put them in ADRs — rejected: an ADR records why and a runbook records how, and the runbook has to be rewritten whenever the process changes.
4. Move them out of the repository (a wiki, a password manager) — rejected: instructions that evolve with the code rot once they leave the repository, and a change to the CI configuration and the change to its runbook should be visible in the same PR.

## Decision

We choose **option 1**: operations runbooks are a persistent document class of their own.

- **Location (mandatory):** every runbook goes in `docs/ops/`, never loose in the `docs/` root. Mixed in with design documents and postmortems, each cleanup would again ask whether a file should be deleted; a separate directory is itself the classification.
- **Test:** the document describes how the current process is operated (commands, configuration items, credential semantics, reading failures), not why it was decided or how an incident was diagnosed.
- **Upkeep:** updated in place, never appended to or archived: when the process changes, the runbook changes with it. A stale runbook is worse than none.
- **Division with ADRs:** an ADR records why (why a release must be notarized), a runbook records how (the commands to verify one when notarization fails). Neither replaces the other.

## Consequences

- Positive: Moving machines, replacing a certificate or rebuilding infrastructure has one authoritative place, and a cleanup has an explicit test, so no runbook is deleted by mistake.
- Negative: One more persistent class has to be kept true, and a runbook that lags its process misleads; the backstop is that a PR changing a process must update its runbook.
- Neutral: The class is outside the classes of ADR-0013, and the prototypes are likewise a class of their own (ADR-0014).

## Sources

- The classification review made while cleaning up the old design documents in `docs/`; ADR-0012 (why only, no operating steps).
