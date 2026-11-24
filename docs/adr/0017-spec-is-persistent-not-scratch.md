# ADR-0017: Specs are persistent artifacts, kept apart from tickets

- Status: Accepted (2026-11-25)

## Context

What a feature enumerated, its boundaries and what it explicitly does not do, is held by no committed document: ADRs record trade-offs, not boundaries. Kept with tickets and process records, which are not committed, it never reaches whoever next changes the code, who must enumerate again, usually worse because the original scenarios are no longer at hand. Where should it live?

## Options

1. **A persistent class of its own: `docs/specs/`, one file per functional module, a current description rewritten in place and deleted when the module is removed, holding the module's user-visible behaviour together with its enumerated boundaries**
2. Keep specs with tickets and process records as working papers — rejected: the enumeration of boundaries has no home and is rebuilt every round of development.
3. Keep a features catalogue of user-visible behaviour beside the specs — rejected: the two descriptions overlap and no check keeps them in agreement.
4. Fold the enumeration into ADRs — rejected: boundaries evolve with the implementation and are mostly not hard-to-reverse trade-offs, so they fail the ADR thresholds and would crowd the index.

## Decision

We choose **option 1**: specs are a persistent class of their own in `docs/specs/`, one file per functional module, a current description rewritten in place and deleted when the module is removed. A spec holds its module's current user-visible behaviour as well as its enumerated boundaries, and no separate catalogue of features exists.

## Consequences

- Positive: Boundary enumerations have one home and no longer evaporate when a feature merges, and the coverage list of `/tdd` and the coverage dimension of `/review-tests` have a stable basis.
- Positive: A spec's body is user stories and enumerated boundaries, far more stable than implementation detail, and its implementation layer keeps only abstract decisions, with no type names or module layout.
- Positive: User-visible behaviour is described once, so no second description can fall out of agreement with the spec.
- Negative: There is one more class of documents to maintain, and specs rot, since the implementation detail they describe goes stale. Only the discipline of writing deviations found during implementation back into the spec holds it, the same cost for which persistent design documents were rejected in ADR-0013.
- Negative: A spec serves two kinds of reader, the one who wants what a module does and the one who wants its boundaries, and can be written badly for both unless the user-side statements and the boundary entries are kept apart within it.
- Neutral: Distribution channels such as the landing page and the security baseline have specs like feature modules do.

## Sources

- The global `/to-spec` convention that specs are persistent artifacts (set 2026-08-01), which this entry applies in this repository.
- First case: the landing-page domestic-mirror round, whose enumeration held three boundaries found only before implementation (empty environment-variable semantics, the ICP number on non-home pages, a variable forgotten at deploy), none of which any existing document class could hold.
