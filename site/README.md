# Transfer 官网落地页 (site/)

Astro 静态站,中英双语(中文 `/`,英文 `/en/`)。部署到 Cloudflare Pages。

## 本地预览

```bash
cd site
pnpm install
pnpm dev        # http://localhost:4321/
```

其他命令:

```bash
pnpm build      # 构建到 site/dist/
pnpm preview    # 预览构建产物
pnpm test       # 运行站点测试(vitest,用站点自己的 Astro 配置,可渲染 .astro 页面)
pnpm check      # type-check the site against site/tsconfig.json (CI runs it too; why not astro check: .github/workflows/checks.yml)
```

## 结构

```
site/
  src/
    pages/
      index.astro        # 中文首页 (/)
      en/index.astro     # 英文首页 (/en/)
    components/          # Hero / Features / HowItWorks / Download / Security
    layouts/Base.astro   # 顶栏 + 页脚 + <head>
    i18n/ui.ts           # 全部中英文案(提炼自 README)
    download-config.ts   # ★下载区的固定部分:下载主机、五个文件名的规则(版本号不在这里,见下)
    releases.ts          # 读 latest.json 与 GitHub Releases,校验出要提供的版本
    download-section.ts  # 下载区的运行时脚本:决定状态并原地更新页面
    styles/global.css    # 全局样式(品牌色 #8a67ab)
  public/favicon.svg     # 站点图标(复用 app 图标)
```

## 待办(阶段一之后)

- **换真实截图**:`src/components/Hero.astro` 里的占位框,替换为放在 `public/screenshots/` 的应用截图。
- **回填下载来源**:`src/download-config.ts` 顶部的 `R2_BASE` / `GITEE_REPO`(阶段三接好 R2、Gitee 后)。
- **换域名**:`astro.config.mjs` 的 `site` 字段。

## 发版不用改站点

站点里没有版本号。下载区在访客的浏览器里读 `https://dl.aloongplanet.com/latest.json`(读不到再读 GitHub Releases,两处都不行就给 GitHub 的发布列表),所以发新版本既不用改这里的代码,也不用重新部署两处站点。规则见 [docs/specs/landing-page.md](../docs/specs/landing-page.md);R2 的 CORS 白名单见 [docs/ops/cn-mirror-deploy.md](../docs/ops/cn-mirror-deploy.md)。
