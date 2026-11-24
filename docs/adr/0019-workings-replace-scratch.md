# ADR-0019: Process records live in `docs/.workings/`, kept on the machine and not committed

- Status: Accepted (2026-08-16)

## Context

Working papers (process records, research intermediates) were discarded at merge, on the premise that merging ends the work. Two kinds of content break that premise: an investigation of work set aside unfinished, which would have to be redone and usually comes out worse because the original context is gone, and the decision to set work aside, with its reason and restart criterion, which fits no document class (not an ADR, not a term or constraint, not visible behaviour) and evaporates in conversation. Where should working papers live, and for how long?

## Options

1. **Move them to `docs/.workings/<slug>/`, still gitignored but no longer deleted at merge** — the dot name keeps them visually apart from the reader-facing classes in `docs/`, and they stay on the machine for reuse across rounds.
2. Move them to `docs/.workings/` and commit them — rejected: process records rot fastest and are explicitly not to be relied on, so committing them adds noise to every PR diff and invites later readers to cite them, while all they need is "I can still see it next time", not "everyone can see it".
3. Keep `.scratch/` as throwaway and find another home for leftover tasks (GitHub Issues or a to-do section in the glossary) — rejected: a to-do section would make the glossary serve two kinds of reader, and discarding the record while keeping the task forces a judgement on every record before each change, which is itself error-prone.
4. Put working papers in `docs/` level with the other classes — rejected: their trustworthiness is of a different order, and equal placement invites later readers to cite them.

## Decision

We choose **option 1**. Process records, research intermediates and the local tickets that `docs/agents/issue-tracker.md` still keeps are written to `docs/.workings/<slug>/`: still gitignored and never committed, but not deleted when the feature merges, so that unfinished work restarts from them.

Keeping is not trusting: the content is never a basis for the current state, which is defined by `docs/specs/`, `docs/adr/`, `docs/CONTEXT.md` and `AGENTS.md`. Its value is only that restarting unfinished work does not start research from zero, and any line number or code claim cited from it is first checked against the code.

## Consequences

- Positive: Work set aside keeps its research when restarted, and the decision "not now", with its reason and restart criterion, can be written down instead of evaporating in conversation.
- Positive: Not being committed, the records leave PR diffs untouched and do not gain the visibility of the persistent classes.
- Negative: The content exists only on this machine, so a new machine, a fresh clone or CI has none of it, and without version history a wrong edit cannot be traced. Whatever someone elsewhere must know is therefore promoted out of it to its home under ADR-0013, the test being whether anyone would be caught out if only this machine held the item.
- Negative: The directory accumulates content that nobody cleans up. Keeping is the default, not an obligation: once a feature is fully done with nothing left over, its whole slug directory may be deleted.
- Neutral: `.gitignore` lists `docs/.workings/`, and `.scratch/` is not used.

## Sources

- The global CLAUDE.md steps 4–7 (revised 2026-08-16: process records go to `docs/.workings/<slug>/` and are kept, but never relied on), which this entry applies in this repository.
- First case: the character-icon cleanup, split into three tickets, one of which (the screenshot toolbar) was set aside after an icon-library comparison by full index search across seven libraries; that comparison had to survive across rounds.
