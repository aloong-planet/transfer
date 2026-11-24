# ADR index

One decision per file, `docs/adr/NNNN-slug.md`, numbered in sequence; a number is never reused.

## Rules

- **What gets an ADR:** a decision that meets all three thresholds (hard to reverse, puzzling without its context, the product of a real trade-off) and that the routing below sends to an ADR. This project's architecture decisions, the trade-offs behind product behaviour and calculation conventions, and this project's choices on process questions (the choice and its reasons only, never the rules of that practice) go to an ADR. Cross-project process rules go to the skill that governs the work, constraints on whoever changes code go to the Invariants section of `AGENTS.md` (the trade-off behind one gets an ADR if it meets the thresholds), statements of product behaviour go to the feature's spec, incidents go to a postmortem, and how code implements a decision goes to that code's comments.
- **Five sections, all required.** Context: the problem and the constraints on it, value-neutral, at most 3 sentences. Options: one item each of at most 2 sentences, the chosen one first, rejected ones with the reason for rejection, deferred ones with the reason and the condition to restart; an option with no record is marked "(not recorded)" with its nature, and a comparison is never invented afterwards. Decision: the rule in force, in the active voice. Consequences: items that open with `Positive:`, `Negative:` or `Neutral:`, each at most 2 sentences, all three kinds present, only what still holds. Sources: pointers to the evidence and the key numbers the decision rests on, each with its premise.
- **Never written in an entry:** how a rule came about; how it was verified or rolled out; one-off costs already paid; how code implements the decision, and interface detail; how a measurement was taken; line numbers and lists of places; what another ADR, spec or skill already says (a pointer only); options about how the decision is recorded in documents.
- **Length:** at most 5,000 characters per entry, excluding the title and status line. Over that, content on the never-written list moves out first, and the decision is split only after that.
- **Status:** `- Status: Proposed` or `- Status: Accepted (YYYY-MM-DD)`, the date being when the user confirmed the decision in force.
- **Changing an entry:** an entry states only the decision in force, so a changed decision is edited in place and never replaced by a new entry. A change to what an entry chose, rejected or accepted needs the user's confirmation first, writes the abandoned practice in as a rejected option with the reason for dropping it, and moves the status date to the confirmation. A rewrite that changes no decision (compression, merging, correcting a stale fact) needs no confirmation, keeps the date, and is listed in the record handed over with the change. A new decision that makes a sentence of an existing entry's Decision untrue edits that entry, and only a decision that touches none opens a new one.
- **Retiring a number:** an entry merged into another, or whose decision is withdrawn, loses its file and number in the same change. Every reference to the number, code comments included, is repointed to the entry it merged into or removed, and the number is listed in a "Retired numbers" section below with its destination or "Withdrawn".
- **Entries written under earlier rules** stay as they are until a change touches their own statements, and are then rewritten whole to this format; an entry's status line and its status cell in the index keep the old wording until then.

The index and the entries are kept in step: a new entry adds a row, and a changed title or status changes its row in the same change.

The files named without a link in the Sources of older entries (such as `https-migration.md` and `screenshot-feature.md`) are design documents from before this document system, deleted in the documentation reorganisation (#15). They keep their original file names rather than pointing at a successor, since an ADR records what a decision rested on at the time; find the original with `git log --all --diff-filter=D -- 'docs/<name>.md'`, then `git show <commit>^:docs/<name>.md`.

| # | Decision | Status |
|---|---|---|
| [0001](0001-lan-direct-no-server.md) | 局域网直连,无服务器、无账号 | 已接受 |
| [0002](0002-fingerprint-as-device-identity.md) | 证书 SHA-256 fingerprint 作为设备唯一标识 | 已接受 |
| [0003](0003-chat-persistence-node-sqlite.md) | 聊天历史持久化用 node:sqlite(为此升级 Electron 35) | 已接受 |
| [0004](0004-https-self-signed-tofu.md) | 传输走 HTTPS 自签证书 + 指纹 TOFU pinning | 已接受 |
| [0005](0005-discovery-respond-via-http-register.md) | 发现回应改为 HTTP 定向 register,不扫网段 | 已接受 |
| [0006](0006-broadcast-fallback-dual-channel.md) | announce 双通道——多播之外同时发子网广播 | 已接受 |
| [0007](0007-app-scheme-replaces-file.md) | 生产环境用 app:// 自定义 scheme 加载渲染页(替代 file://) | 已接受 |
| [0008](0008-screenshot-scope.md) | 截图功能范围——三出口,对齐 Snipaste 标注,不做通用截图软件 | 已接受 |
| [0009](0009-overlay-persistent-not-recreated.md) | 截图 overlay 窗口常驻复用,不重建 | 已接受 |
| [0010](0010-mac-three-arch-plus-locale-prune.md) | macOS 三架构全打(universal + arm64 + x64)+ locale 裁剪 | 已接受 |
| [0011](0011-remove-gitee-mirror.md) | 移除 Gitee 镜像,下载源精简为 R2(主)+ GitHub(兜底) | 已接受 |
| [0012](0012-notarization-gate-fail-closed.md) | 正式版 macOS 发布公证门禁 fail-closed;预发布只签名 | Superseded by [ADR-0023](0023-notarize-every-published-mac-build.md) |
| [0013](0013-docs-lifecycle-by-rot-risk.md) | 文档体系按"腐烂速度"分类管理(采纳 harness workflow) | 已接受(第 3 项经 [ADR-0017](0017-spec-is-persistent-not-scratch.md)、[ADR-0019](0019-workings-replace-scratch.md) 两次修订) |
| [0014](0014-prototypes-as-persistent-asset.md) | 原型目录 docs/prototypes/ 作为持久资产保留 | 已接受 |
| [0015](0015-ops-runbooks-as-fifth-doc-class.md) | 运维手册作为第五类文档,就地更新 | 已接受 |
| [0016](0016-mas-separate-bundle-id.md) | App Store 版用独立 bundle id `com.aloongplanet.transfer` | 已接受 |
| [0017](0017-spec-is-persistent-not-scratch.md) | spec 从"用完即丢"改为持久产物,与 tickets 分家 | 已接受 |
| [0018](0018-cn-mirror-landing-page-only.md) | The landing page goes to a mainland node, the download source stays on R2 | Accepted |
| [0019](0019-workings-replace-scratch.md) | 施工文档从 `.scratch/` 迁到 `docs/.workings/`,并从"合并后删除"改为"本机保留" | 已接受 |
| [0020](0020-upload-idle-timeout-not-total.md) | 传输超时改为空闲语义,不再限制总时长 | 已接受 |
| [0021](0021-schema-migration-by-declared-columns.md) | 表结构迁移用「列声明单一事实源 + 按需补列」,不引版本号 | 已接受 |
| [0022](0022-receive-dir-user-selectable.md) | 接收文件夹可由用户选定,失效时自动退回默认且不保留原路径 | 已接受 |
| [0023](0023-notarize-every-published-mac-build.md) | Notarize every published macOS build; local packages are signed only; no certificate, no package | Accepted |
| [0024](0024-packaged-build-refuses-launch-inputs.md) | A packaged build refuses every launch input outside an allow-list, and the fuses close Node's entries | Accepted |
| [0025](0025-only-transfers-pages-and-quarantined-files.md) | Windows hold only Transfer's own pages, IPC answers only them, and received files are quarantined | Accepted |
