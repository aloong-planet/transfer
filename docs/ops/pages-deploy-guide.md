# Cloudflare Pages 说明(落地页 transfer-org)

> **Current state:** Transfer's website, `transfer.aloongplanet.com`, is built and uploaded to the Pages project `transfer-org` by the Deploy workflow of `aloong-planet-home`, from that repository's `apps/transfer`. This repository has no site code and starts no deployment: a push to its `master` changes nothing that the address serves.

## 现状

- Pages 项目 `transfer-org`、自定义域 `transfer.aloongplanet.com` 和指向它的 DNS 记录都已存在,由 `aloong-planet/infra` 管理(`stacks/apps/landing-pages.tf` 里的 `transfer-org` 条目,生产分支 `master`)。项目、域名、DNS 的任何改动都在 infra 里做:在面板里改的,会在 infra 下一次 plan 里显示为漂移,下一次 apply 时被还原。
- Cloudflare 的 Git 构建已关,见 [aloong-planet/infra#33](https://github.com/aloong-planet/infra/pull/33):项目不再因任何仓库的推送而构建。
- 站点代码在 aloong-planet-home 的 `apps/transfer`。该仓库的 Deploy workflow 在 main 上的 CI 通过之后,经 `pnpm --filter @aloong-planet/transfer run cf:deploy` 直接上传构建产物,上传到哪个项目、哪个生产分支由 `apps/transfer/deployment.config.json` 定。命令、令牌与失败后的恢复见 aloong-planet-home 的 [deployment.md](https://github.com/aloong-planet/aloong-planet-home/blob/main/docs/ops/deployment.md)。
- `aloongplanet.com` 区域与这个 Pages 项目在同一个 Cloudflare 账户:infra 的 `stacks/apps` 里,`cloudflare_account_id` 就是拥有该区域和 R2 桶的账户。

## 验证

- 打开 `https://transfer.aloongplanet.com` —— 落地页出来
- 切中英(点右上角 EN/中文)—— `/en/` 正常
- 点各平台下载按钮 —— 在正式域名上跳到 `dl.aloongplanet.com/releases/v<当前版本>/...`(版本号取自 `latest.json`),能下

临时地址 `transfer-org.pages.dev` 不在 R2 的 CORS 白名单里,读不到 `latest.json`,下载区显示 GitHub 状态,按钮指向 GitHub;指向 `dl.aloongplanet.com` 的状态要在正式域名上确认。

## 常见坑

- **站点内容不对 / 没更新** → 站点在 aloong-planet-home:看它 main 上的 Deploy 运行有没有成功,改动也在那里做。往本仓库推送不会改变线上内容。
- **下载按钮 404** → 检查 R2 桶里 `latest.json` 所指版本的 `releases/v<版本>/` 下确有对应文件。
- **想把安装包放进站点一起部署** → 不行:Cloudflare Pages 单文件上限 25 MiB,安装包比它大得多。落地页在 Pages,安装包只放 R2(`dl.aloongplanet.com`),二者不合并。

## Moving the project or its domain

The Pages project is `transfer-org` (`transfer-org.pages.dev`), with `transfer.aloongplanet.com` as its custom domain; its Git builds are off, and `aloong-planet-home` uploads to it.

When replacing the project or moving the domain, make each change in `aloong-planet/infra`, not in the dashboard: the project, its domain and its DNS record are Terraform's. Name the replacement project in `aloong-planet-home`'s `apps/transfer/deployment.config.json`, upload the site to it and verify it before moving the custom domain. Cloudflare does not allow the same custom domain on both projects: remove its old binding, add it to the replacement, and confirm the CNAME target. Then verify domain status, HTTPS, both language pages, installer links and the statistics request. Keep the previous deployment available until validation succeeds.
