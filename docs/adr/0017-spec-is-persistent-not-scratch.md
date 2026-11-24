# ADR-0017: Specs are persistent artifacts, kept apart from tickets

- Status: Accepted (2026-08-04)

## Context

What a feature enumerated, its boundaries and what it explicitly does not do, is held by no other document: ADRs record trade-offs and `docs/features/` records visible behaviour. Kept with tickets and process records, which are not committed documents, it never reaches whoever next changes the code, who must enumerate again, usually worse because the original scenarios are no longer at hand. Where should it live?

## Options

1. **A persistent class of its own: `docs/specs/`, one file per functional module, a current description rewritten in place and deleted when the module is removed**
2. Keep specs with tickets and process records as working papers — rejected: the enumeration of boundaries has no home and is rebuilt every round of development.
3. Fold the enumeration into `docs/features/` — rejected: features is written from the user's side with no implementation detail, so failure modes and "explicitly not done" would make it serve two kinds of reader and both would be written badly.
4. Fold the enumeration into ADRs — rejected: boundaries evolve with the implementation and are mostly not hard-to-reverse trade-offs, so they fail the ADR thresholds and would crowd the index.

## Decision

We choose **option 1**: specs are a persistent class of their own in `docs/specs/`, one file per functional module, a current description rewritten in place and deleted when the module is removed.

## Consequences

- Positive: Boundary enumerations have one home and no longer evaporate when a feature merges, and the coverage list of `/tdd` and the coverage dimension of `/review-tests` have a stable basis.
- Positive: A spec's body is user stories and enumerated boundaries, far more stable than implementation detail, and its implementation layer keeps only abstract decisions, with no type names or module layout.
- Negative: There is one more class of documents to maintain, and specs rot, since the implementation detail they describe goes stale. Only the discipline of writing deviations found during implementation back into the spec holds it, the same cost for which persistent design documents were rejected in ADR-0013.
- Neutral: Slugs correspond to `docs/features/` entries but not one to one: distribution-channel specs such as the landing page have no features entry under the features directory's own inclusion rules.

## Sources

- The global `/to-spec` convention that specs are persistent artifacts (set 2026-08-01), which this entry applies in this repository.
- First case: the landing-page domestic-mirror round, whose enumeration held three boundaries found only before implementation (empty environment-variable semantics, the ICP number on non-home pages, a variable forgotten at deploy), none of which any existing document class could hold.
