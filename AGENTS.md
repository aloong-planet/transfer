# Transfer — 项目约定

Cross-skill project facts live in `capabilities.toml` at the repository root.

## 文档体系(见 ADR-0013 / 0014 / 0015)

Each class of document has exactly one home, chosen by how fast it rots; see `docs/agents/docs-layout.md`.

## Invariants

- A test seam the main process reads is an environment variable named `TRANSFER_*`; the main process reads no other launch argument or variable (ADR-0024).
- The packaging check's plain launch is the only automated launch of Transfer that may announce on the LAN (ADR-0024).
- Every IPC handler for the renderer is registered through the sender-checking `handle` wrapper, never directly through `ipcMain`, a web contents' `ipc` object or its IPC message events (ADR-0025).
- No window is created with its sandbox off or with Node integration on (ADR-0025).
- A change to windows, sessions, protocols, IPC handlers, launch inputs, the Electron major version or the packaging platforms updates `docs/ops/electron-security.md` in the same change.
- Every peer request goes through the pinned HTTPS agent except the discovery reply (`POST /register`), which goes through the unpinned `discoveryAgent` (docs/specs/discovery.md section E, `src/main/transfer/http-client.ts`).
- A peer's registered address is never refreshed from a `POST /register` response body, which omits the port (docs/specs/discovery.md section A, `src/main/app-core.ts`).
- A string that came from a peer, the fingerprint included, is never used as a key of a plain object: use a `Map`, or read only own entries (device-alias::REQ-003/AC-04 in docs/specs/device-alias.md, `src/main/settings.ts`).
- A transfer timeout is an idle timeout, never a total duration, and every code path that receives or sends upload bytes refreshes the idle timer, including the one that discards a duplicate body (ADR-0020).
- A schema change edits the declared columns, never a hand-written `ALTER`; a new column is nullable; the pre-change `CREATE` statement is added as a snapshot to the migration test (ADR-0021).
- Code that reads a message's `status` or `error_reason` copes with values outside the union: a set-membership judgement is a `Record` lookup over every member, collapsed to a boolean, never `Set.has` or chained `===` (`src/shared/message.ts`).
- Every main-process path that shows or copies an image turns the decoded bitmap by its EXIF orientation through `src/main/image-orientation.ts` (docs/postmortems/exif-orientation-ignored.md).
- Nothing modifies a macOS app or DMG after it is signed: locales and architectures are trimmed by electron-builder before signing, never by deleting files, `lipo` thinning or `codesign --deep` re-signing afterwards (docs/specs/mac-distribution.md, docs/ops/mac-signing.md).
- Installers are hosted in R2, never in Cloudflare Pages (docs/ops/pages-deploy-guide.md).
- An icon comes from Lucide, then Tabler where Lucide has no equivalent, then Material Symbols through `FilledIcon` only, and `src/renderer/src/icons.tsx` names each icon's source (that file's header comment).
- The screenshot toolbar's text tool keeps the literal `A`, the one character icon; it is a decision, not an omission, so it is not replaced by an SVG (`src/renderer/src/overlay.tsx`).
- Copy never lists the interface languages as if the list were complete (`src/shared/i18n/dict.ts`).
- A new startup action is judged by whether the user, or anyone on their LAN, can notice it while the user's own instance runs; multicast announce is the one that can, the HTTP port is not (`src/main/index.ts`).
- In a quiet test instance, mouse events are built as `MouseEvent`s inside the page, never through Playwright's `dispatchEvent('contextmenu')` (docs/postmortems/playwright-contextmenu-no-coordinates.md).
- A quiet test instance's window is never shown in order to take a screenshot: it renders while hidden, and `toBeVisible()` there tests layout visibility only (the comment on `QUIET` in `src/main/index.ts`).
- An e2e case replaces one of the app's IPC handlers only after `firstWindow()` has returned (the header of `e2e/screenshot.spec.ts`).
- The repository carries project knowledge, not the operator's working instructions: `CLAUDE.md`, `.claude/` and `docs/.workings/` are not committed, so what a fresh clone must know goes into a knowledge document (ADR-0013, `docs/agents/docs-layout.md`).

## Agent skills

workflow skills 装在用户全局 `~/.claude/skills`(八步流程见全局 CLAUDE.md 骨架),仓库不携带。多 session 大 feature 走:`/grill-with-docs` → `/to-spec` → `/to-tickets`(三步同一上下文)→ 每张 ticket 新鲜上下文 `/implement`。

### Issue tracker

Tickets are GitHub Issues in this repository; an unfixed, exploitable security finding stays a local markdown ticket under `docs/.workings/`. See `docs/agents/issue-tracker.md`.

### Documentation layout

Single context: the glossary in `docs/CONTEXT.md`, decisions in `docs/adr/`, the constraints on code in the Invariants section above. See `docs/agents/docs-layout.md`.
