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

## Agent skills

workflow skills 装在用户全局 `~/.claude/skills`(八步流程见全局 CLAUDE.md 骨架),仓库不携带。多 session 大 feature 走:`/grill-with-docs` → `/to-spec` → `/to-tickets`(三步同一上下文)→ 每张 ticket 新鲜上下文 `/implement`。

### Issue tracker

Tickets are GitHub Issues in this repository; an unfixed, exploitable security finding stays a local markdown ticket under `docs/.workings/`. See `docs/agents/issue-tracker.md`.

### Documentation layout

Single context: one `CONTEXT.md` at the repository root, decisions in `docs/adr/`. See `docs/agents/docs-layout.md`.
