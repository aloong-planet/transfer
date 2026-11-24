# Specs

Each spec is the current requirement picture of one feature, for people changing that part of the product: what the feature does in the current version, the boundaries it has worked through, and what it explicitly does not do. Trade-offs are decided in [adr/](../adr/), and a spec cites the ADR by number.

| Spec | In one line |
|---|---|
| [discovery.md](discovery.md) | 设备发现的需求全景:报文自我过滤/网卡选择/端口/设备生命周期/信任回应/网络环境限度六组边界,含「再加一条发现通道无济于事」的死路 |
| [device-alias.md](device-alias.md) | A custom name for a discovered device: set, clear and show it, and keep it by device identity |
| [transfer-chat.md](transfer-chat.md) | 传输与聊天的需求全景:协商/传输/落盘/失败分类/文本/速度与耗时/表结构演进/持久化/图片菜单与复制九组边界穷举、测试决策、明确不做的与已知缺口 |
| [unread.md](unread.md) | The unread-message alerts: the Dock badge or taskbar flash, and the per-conversation count in the device list |
| [screenshot.md](screenshot.md) | Capturing a region of the screen with a global shortcut, annotating it, and sending, copying or saving it; the macOS screen-recording permission |
| [receive-dir.md](receive-dir.md) | 接收文件夹可由用户选定:选择/恢复默认/失效退回/告知/路径展示七组边界,含沙盒容器路径展示与 App Store 2.4.5(i) 的由来 |
| [theme.md](theme.md) | The theme preference: follow the system, light or dark |
| [language.md](language.md) | The interface-language preference: follow the system, Chinese or English |
| [landing-page.md](landing-page.md) | The landing page's header link back to the aloong planet homepage (what it shows, its look in both languages and on narrow windows), how narrow a window every page fits without sideways scrolling, and which download the download section offers (read in the visitor's browser: the latest-release pointer, then GitHub's releases, then GitHub's release list) |
| [landing-page-deploy.md](landing-page-deploy.md) | 落地页一份代码两处部署:备案号的注入与渲染边界、与下载/统计的回归点、部署约束 |
| [mac-distribution.md](mac-distribution.md) | macOS Developer ID / DMG distribution: which builds are signed and notarized, the two entry commands and the in-build notarization hook, the CI tiers, the no-certificate failure and the release gate |
| [electron-security.md](electron-security.md) | The Electron security baseline: only Transfer's own pages in every window, IPC answered only for them, minimal permissions, sandboxed renderers, quarantined received files on macOS, and the checklist's ledger |

## Invariants

- **一个功能模块一篇**,现行描述、就地改写;不记变更史(git 里有),功能移除即删文件。既有功能的增量开发是改写既有 spec,不新开文件。
- A spec states its feature's user-visible behaviour as well as its enumerated boundaries; no other document describes that behaviour (ADR-0017).
- **不写文件路径与代码片段**——那些腐烂得最快。写抽象层的决策。
- 够 ADR 三门槛的决策落 ADR 后,spec 改为引用编号。
