# Documentation layout

Where this repository's documents live, which of them can be relied on, and which cannot.

Before writing a document, decide which class it belongs to: each class rots at a different speed and has exactly one home (ADR-0013).

## Conclusions and process records are not the same thing

**Conclusions** answer "what is true now"; any skill may rely on them:

| Location | Question it answers | Maintained by |
|---|---|---|
| `docs/CONTEXT.md` | What each term means and which synonyms to avoid. Read it before changing anything | `/domain-modeling` |
| `AGENTS.md`, Invariants section | The constraints on whoever changes code, one line each, worded as a constraint and naming where its reason lives | `/domain-modeling` |
| `docs/adr/` | Why a decision was made and what was rejected. One decision per file, stating only the decision in force: when it changes, its entry is rewritten in place with the user's confirmation. The rules and the index are in its `README.md` | `/domain-modeling` |
| `docs/specs/<slug>.md` | What a feature does in the current version, which boundaries it has worked through, and what it explicitly does not do. Rewritten in place; the trade-offs belong in ADRs and are cited by number. A persistent artifact, not deleted when the feature merges (ADR-0017) | `/to-spec` |
| `docs/prototypes/` | What the interface and state models look like. Kept permanently (ADR-0014); browse them all from the `index.html` gallery | `/prototype` |
| `docs/postmortems/` | The causal chain of one incident. One per file, append-only, written in the same round a real bug is diagnosed, indexed in its `README.md` | `/implement` step 7 |
| `docs/ops/` | This project's runbooks — how the current processes are operated (for example signing, notarization, Pages, R2, download statistics) with their actual values. Updated in place; every new runbook goes here (ADR-0015). A PR that changes a process must update its runbook | The PR that changes the process |

`docs/DESIGN.md` is a system design overview of archival value; its status notes may be stale. **The current state is defined by the code and the ADRs.**

**Process records** answer "how it was done at the time":

| Location | Contents |
|---|---|
| `docs/.workings/<slug>/` | Each ticket's process records (`review-code.md`, `review-tests.md` and other notes), and local tickets: those filed before 2026-11-06, and the unfixed security findings that `issue-tracker.md` keeps off GitHub |

**`docs/.workings/` is kept after merge, but no skill may treat it as a reliable basis.** Read it only to answer "why was this done that way at the time", never to infer the current state; check any line number or code claim in it against the code before citing it. When it conflicts with a conclusion document, the conclusion document wins, **and the process record does not need to be corrected**: it is meant to stay as it was. It is a hidden directory, excluded from documentation publishing and from globs such as `docs/**/*.md`.

The repository carries project knowledge, not the operator's working instructions. `CLAUDE.md`, `.claude/` and `docs/.workings/` are not committed (the first two through the global gitignore), so a fresh clone does not have them, and what a fresh clone must know goes into one of the conclusion documents above. The workflow skills and rules are the operator's own assets, reused across projects, so they stay with the person and not the repository (ADR-0013). `AGENTS.md`, `capabilities.toml` and `docs/agents/` are committed, because they hold project facts and pointers to project knowledge that a fresh clone and any agent reading `AGENTS.md` must be able to find; `CLAUDE.md` is only a local one-line `@AGENTS.md` import.

`docs/.workings/` is gitignored (ADR-0019), so only this machine has it: anything that people or models on another machine must know has to be promoted to one of the conclusion documents above. Keeping it is the default, not an obligation: once a feature is fully done with nothing left over, its whole slug directory may be deleted.

## Read these first when exploring

Before changing code or proposing a design, read:

- `docs/CONTEXT.md`, and the Invariants section of `AGENTS.md`
- the ADRs in `docs/adr/` that relate to the area being changed

## Use the glossary's words

Whenever an output mentions a domain concept (issue titles, proposals, assumptions, test names), **it must use the term defined in `docs/CONTEXT.md`**, never a synonym listed under its `_Avoid_`.

A concept missing from the glossary is a signal: either you are inventing language this project does not use (reconsider it), or an entry is genuinely missing (note it and hand it to `/domain-modeling`).

## Conflicts with an existing ADR must be called out

If an output contradicts an ADR, **name the ADR explicitly; never override it silently**:

> _Contradicts ADR-0020 (idle timeout, not total duration) — but worth reopening because…_
