# ADR-0020: Transfer timeouts are idle timeouts and no longer cap the total duration

- Status: Accepted (2026-08-21)

## Context

How large a file Transfer can send has no setting, yet two ceilings exist that nobody chose: the sender reads the whole file into memory to compute its sha256, and two time limits cut long transfers off, a 5-minute total-duration timeout on each upload request and a 30-second idle timeout on the receiving session whose timer was never refreshed while the body flows. The session misjudgement also fails silently: the file lands and upload answers 200, but the receiver finds the session gone and never reports completion, so the sender shows success, the receiver's message stays "in transfer" forever, and the session's other files are cleared with it. Both come from one assumption, that how long a transfer takes decides whether it failed.

## Options

1. **Idle semantics: ask only whether anything is still moving, and cap no total duration**
2. Only raise the fixed values (5 min to 60 min, 30 s to 5 min) — rejected: a hard ceiling coupled to bandwidth remains and a real disconnect takes long to report, so both directions get worse.
3. Idle semantics plus a very large total-duration backstop — deferred: it is the most robust, but it keeps two timeouts whose relation must be maintained and the second never fires in normal use; it returns if Transfer ever faces untrusted peers.

## Decision

We choose **option 1**, and remove the memory ceiling with it, since only fixing memory stalls at the 30-second idle limit and only fixing timeouts runs out of memory.

- The sender computes sha256 chunk by chunk, so peak memory does not depend on file size.
- The receiving session's idle timer refreshes on every byte, on the write-to-disk path and on the idempotent-retransmit path that discards the body alike, and every new path that receives or sends upload bytes refreshes it too.
- The sender's timeout for one upload is an idle timeout of 45 seconds, not a 5-minute total.
- The order of the two ends' thresholds is locked into a guard test: the sender's must exceed the receiver's upper bound for judging idle, `T_IDLE_MS + T_SWEEP_MS` (the sweep interval is part of it), plus a 5-second margin. The session's owner, the receiver, then cleans up first and the sender gets a clear connection error, where the other way round the sender gives up first and the receiver keeps an orphan session holding the single-session lock until its own timeout.

## Consequences

- Positive: The size of a file that can be sent no longer depends on bandwidth or memory, a large file on a slow link is no longer taken for a disconnect, and the silent inconsistency (sender succeeded, receiver stuck "in transfer" forever) is gone.
- Negative: There is no total-duration backstop, so a peer that trickles bytes at intervals under the idle threshold can hang a transfer indefinitely and neither end times out. A LAN point-to-point link has no adversarial peer, so this is accepted; an untrusted peer would need option 3's backstop.
- Negative: The sender's "something is moving" signal is coarser than a refresh per chunk: after `req.write()` returns false, `pipe` pauses until `drain`, which fires only when the whole user-space buffer has emptied, so two refreshes are about the buffered bytes divided by the peer's consumption rate apart. The 45-second threshold leaves a 30-fold margin on a 1 MB/s link, but it cannot be sized as if every chunk refreshed.
- Negative: Waiting for the response after the body is sent shares one budget with the body phase, so a peer may take up to 45 seconds to answer, which is the receiver hang the sender's upload timeout was meant to catch.
- Negative: Only the order of the two thresholds has a guard test, so a new path that receives or sends upload bytes and forgets to refresh the idle timer fails silently as described in the Context, and only the invariant in `AGENTS.md` holds it.
- Neutral: The ceiling on the size of a file is now disk space.
- Negative: Three problems this decision did not solve remain: no disk-space pre-check before writing (lack of space shows as that message turning failed), a hash failure on any file in `buildFileMap` failing the whole batch's prepare-upload, and no interface feedback while a large file is hashed (about 40 seconds for 50 GB).

## Sources

- Research and measurements: `docs/.workings/large-file-transfer/` (a process record, not a basis for the current state). The constants and their order are in `src/shared/protocol.ts` and its guard test, and the constraint on every byte path is in the Invariants section of `AGENTS.md`.
- Measured on Electron 35 and Node 22: reading a 512 MB file into memory raised the main process RSS from 62 MB to 578 MB and a 1 GB file to 1085 MB, so the peak grows 1:1 with the file; the receiver's former idle limit gave 30 s times the link bandwidth, about 3 GB on gigabit wired and about 750 MB on Wi-Fi 5; streaming the hash of 1 GB took 799 ms against 1113 ms; on local loopback about 1.4 MB was swallowed before the pipe paused.
