# ADR-0009: The capture overlay window is created once and reused, not recreated

- Status: Accepted (2026-07-27)

## Context

Creating the capture overlay window on every trigger puts a visible delay between the shortcut and the selection appearing. Capturing is meant to feel fast.

## Options

1. **Create the window on first use, then keep it and only hide and show it, without reloading its page** — chosen.
2. Create and destroy the window on every trigger — rejected: the cold start of window creation plus page load falls on every trigger.
3. Create the window ahead of time and reload its page on every trigger — rejected: the reload still costs a page load, and its state-passing issue is the same as option 2's.

## Decision

We keep one capture overlay window (option 1). Its page is loaded once, so state that changes while the app runs, such as the interface language, reaches the overlay in two ways: an initial value injected when the overlay loads, and an event broadcast whenever the state changes. Nothing may assume the overlay takes the state in again each time it opens.

## Consequences

- Positive: A capture after the first creates no window, so it carries no window-creation cost.
- Negative: Every state the overlay needs has to take both routes, and a state that misses one leaves the overlay showing the old value after a setting changes.
- Neutral: The window is created by the first capture of a run and lives until the app quits, so only that first capture pays for creating it.

## Sources

- `screenshot-feature.md`, a design document from before the document system, deleted in the documentation reorganisation (#15); the index README says how to recover it.
- The project memory note "overlay常驻非重建".
