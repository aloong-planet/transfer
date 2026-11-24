# ADR-0014: The prototype directory docs/prototypes/ is kept as a persistent asset

- Status: Accepted (2026-11-25)

## Context

ADR-0013 sorts documents into classes by how fast they rot, and prototypes are not among them. The prototype skill this project uses treats a prototype as throwaway code, deleted from `docs/prototypes/` when the branch merges. A prototype's state-machine diagram and drivable panel express how a module works more precisely than prose, and the gallery (`docs/prototypes/index.html`) makes them browsable, so clearing them means rebuilding the same model each time it must be understood.

## Options

1. **Keep prototypes permanently: `docs/prototypes/` becomes a persistent class of document, with a discipline against rot**
2. Follow the upstream practice of discarding a prototype once it has answered its question, so that main keeps only the validated decisions — rejected: it loses the drivable model, and the same model is rebuilt again and again.
3. Keep only the diagrams and drop the drivable panels and logic modules — rejected: the panel's value is that one can overturn an assumption by hand, which a static diagram cannot do, and a logic module such as `legal()` can be promoted into real code.
4. Make prototypes part of the specs — rejected: specs describe user-visible behaviour and prototypes describe internal models, so their audiences and content rules differ.

## Decision

We choose **option 1**: `docs/prototypes/` stands beside the code and tests, the ADRs, `CONTEXT.md` and the postmortems as a persistent asset, and is not emptied when a feature merges.

Its discipline against rot rests on a prototype describing the model, not the implementation, so rot comes only from the model changing:

- When the model changes, the `.mmd` and `logic.js` are changed together and `sync-mmd.mjs` is rerun. Where that is not done, the prototype page's question section is marked "已失效:模型已演进,见 <出处>", because an obsolescence mark beats silent rot.
- A prototype holds states, transitions and admission conditions, never file paths, field names or function signatures, the same rule as `CONTEXT.md`.
- When the feature is removed, its prototype directory and manifest entry are deleted with it.

## Consequences

- Positive: A model has a living document that can be driven, the gallery gives an overview of the models across modules, and a logic module such as `legal()` can be promoted into real code.
- Negative: There is one more class of persistent documents whose accuracy must be maintained, and a prototype misleads when a model change is not synced. The obsolescence mark, not remembering, is what covers that.
- Neutral: A prototype that has been used stays, and only its decisions are folded into specs and ADRs.

## Sources

- The capture clause of the prototype skill (`~/.claude/skills/prototype/`).
- ADR-0013's classification of documents.
