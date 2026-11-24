# Cloudflare Pages 部署手册(落地页上线)

> 目标:把 `site/`(Astro)部署到 Cloudflare Pages,绑定 `transfer.aloongplanet.com`,
> 连 GitHub 仓库自动部署(以后 push 到指定分支自动重建)。

> **Current state:** the Pages project `transfer-org`, its custom domain `transfer.aloongplanet.com` and the DNS record that points the domain at it already exist, and `aloong-planet/infra` defines them (the `transfer-org` entry in `stacks/apps/landing-pages.tf`). Do not follow the prerequisites and Steps 1–4 below in the dashboard. Step 2's values for the project name, production branch, build command, output and root directories and `NODE_VERSION` are the entry's. Change any of them, or the domain, in `aloong-planet/infra`: a change made in the dashboard shows up as drift in that repository's next plan and is reverted by its next apply.

## 前置

- [ ] PR #6 已合并进 `master`(Pages 要构建 master 上的 `site/`;若先连 `feat/landing-page` 分支也行,但合并后要改回 master)。
- [ ] `aloongplanet.com` 已在同一 Cloudflare 账户(已确认)。

---

## 第 1 步:创建 Pages 项目并连 GitHub

1. Cloudflare 面板 → 左侧 **Workers & Pages** → **Create application** → **Pages** 标签 → **Connect to Git**。
2. 授权 Cloudflare 访问你的 GitHub(首次会跳 GitHub 授权页,选择只授权 `aloong-planet/transfer` 仓库即可)。
3. 选中仓库 **aloong-planet/transfer** → **Begin setup**。

## 第 2 步:构建配置(关键,照填)

在 "Set up builds and deployments" 页:

| 字段 | 填什么 |
|------|--------|
| **Project name** | `transfer-org` (`transfer-org.pages.dev`) |
| **Production branch** | `master` |
| **Framework preset** | `Astro`(选了会自动带出下面两项;没有就手填) |
| **Build command** | `pnpm install && pnpm build` |
| **Build output directory** | `dist` |
| **Root directory (Advanced)** | `site` ← **务必设成 site,否则找不到 Astro 项目** |

环境变量(Advanced → Environment variables):

| 变量 | 值 | 说明 |
|------|-----|------|
| `NODE_VERSION` | `20` | Astro 4 需 Node 18+;保险起见指定 20 |

> ⚠️ **Root directory = `site`** 是最容易漏的一项。你的 Astro 项目在仓库的 `site/` 子目录,不设它 Pages 会在仓库根找 package.json 而失败。
> 设了 Root directory 后,Build output directory 填 `dist`(相对 site/,即 site/dist),**不要**写成 `site/dist`。

## 第 3 步:首次部署

1. 点 **Save and Deploy**。
2. Pages 会拉代码、`pnpm install`、`pnpm build`,几分钟后给你一个 `https://transfer-org.pages.dev`。
3. 打开这个临时地址,确认落地页正常、下载按钮能点。临时地址不在 R2 的 CORS 白名单里,读不到 `latest.json`,下载区显示 GitHub 状态,按钮指向 GitHub;指向 `dl.aloongplanet.com` 的状态在正式域名上确认(见第 5 步)。

## 第 4 步:绑定自定义域 transfer.aloongplanet.com

1. 进 Pages 项目 → **Custom domains** → **Set up a domain**。
2. 输入 `transfer.aloongplanet.com` → **Continue**。
3. 因为 `aloongplanet.com` 已在本账户,Pages 会**自动创建 DNS 记录**(你不用手动加)→ **Activate domain**。
4. 状态变 Active 后,`https://transfer.aloongplanet.com` 就是你的落地页。

## 第 5 步:验证

- 打开 `https://transfer.aloongplanet.com` —— 落地页出来
- 切中英(点右上角 EN/中文)—— `/en/` 正常
- 点各平台下载按钮 —— 在正式域名上跳到 `dl.aloongplanet.com/releases/v<当前版本>/...`(版本号取自 `latest.json`),能下

---

## 以后怎么更新落地页

连了 GitHub 自动部署后:**改 `site/` 下的东西 → 合并到 `master` → Pages 自动重建**。无需手动操作。

## 常见坑

- **构建失败 "package.json not found"** → Root directory 没设成 `site`。
- **构建失败 pnpm 版本** → Pages 会读 `site/package.json` 的 `packageManager`?本项目 site 没写该字段,Pages 默认 pnpm 版本一般够用;若报错,在 infra 的 `transfer-org` 条目的 `build_env` 里加环境变量 `PNPM_VERSION=9`。
- **页面 404 / 样式丢失** → Build output directory 应为 `dist`(相对 site/),别写成绝对或 `site/dist`。
- **下载按钮 404** → 检查 R2 桶里 `latest.json` 所指版本的 `releases/v<版本>/` 下确有对应文件。
- **想把安装包放进 `site/` 一起部署** → 不行:Cloudflare Pages 单文件上限 25 MiB,安装包比它大得多。落地页在 Pages,安装包只放 R2(`dl.aloongplanet.com`),二者不合并。

## Organization repository

The source repository is `aloong-planet/transfer`. The Git-integrated Pages project is `transfer-org` (`transfer-org.pages.dev`), with `transfer.aloongplanet.com` as its custom domain. It builds `master` using the settings above.

When changing repository ownership again, make each change below in `aloong-planet/infra`, not in the dashboard: the project, its domain and its DNS record are Terraform's. First ensure the Cloudflare GitHub App can access the destination repository. Build and verify the replacement Pages project before moving the custom domain. Cloudflare does not allow the same custom domain on both projects: remove its old binding, add it to the replacement, and confirm the CNAME target. Then verify domain status, HTTPS, both language pages, installer links and the statistics request. Keep the previous deployment available until validation succeeds.
