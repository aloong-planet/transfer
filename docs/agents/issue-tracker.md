# Issue tracker: GitHub

Tickets in this repository are GitHub Issues on `aloong-planet/transfer`.

**Every `gh` operation follows the issues.md of `/github-ops` ("Issue operations")**: command shapes, when to pass `-R`, heredoc bodies for multi-line text and the fetch recipes are defined there and not repeated here, so the two cannot drift.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

`gh issue view <n> --comments` (add `-R aloong-planet/transfer` when outside a clone of this repository).

## Label for tickets an agent may pick up

`ready-for-agent`.

Tickets cut by `/to-tickets` carry this label by default: by construction, an unattended agent can pick them up.

## What a ticket holds

A ticket is not a home for durable knowledge: enumerated boundaries go to `docs/specs/`, decisions to `docs/adr/`, terms and invariants to `CONTEXT.md`, incidents to `docs/postmortems/` (see `docs-layout.md`). A ticket's process records (reviews, document-sync lists, evidence) stay in `docs/.workings/<slug>/`, and the ticket names their paths.

A deferred ticket stays open with a dated comment: where the work stopped, which conclusions can be reused as they are, and what to re-check before restarting (line numbers, whether each conclusion still holds).

## Exception: unfixed security findings stay local

The repository is public, and so are its issues. A security finding that is not yet fixed and could be exploited is not filed on GitHub: its ticket is a markdown file under `docs/.workings/<slug>/`, which is gitignored and exists only on this machine. Until the fix is merged, no issue, pull request, commit message or other public text describes the gap; the fix's pull request and commits say only what changed.
