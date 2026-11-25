# 国内镜像部署手册(transfer.aloongplanet.com.cn)

落地页有两处部署,同一份代码。代码在 [aloong-planet-home](https://github.com/aloong-planet/aloong-planet-home) 的 `apps/transfer`,不在本仓库:

| 域名 | 承载 | 部署方式 |
|---|---|---|
| `transfer.aloongplanet.com` | Cloudflare Pages | aloong-planet-home 的 Deploy workflow 在它的 main 合并后**自动**构建并上传(Cloudflare 的 Git 构建已关,见 [aloong-planet/infra#33](https://github.com/aloong-planet/infra/pull/33)),见 [pages-deploy-guide.md](pages-deploy-guide.md) |
| `transfer.aloongplanet.com.cn` | 阿里云 ECS | **手动**跑一条命令,即本手册 |

两份产物的唯一差异是页脚的 ICP 备案号(法规要求,只有国内那份有)。决策与取舍见 ADR-0018。

> **下载源不在本手册范围内。** 安装包仍在未备案的 Cloudflare R2 上,国内镜像**不改变下载速度**,快的只是页面打开。

## 日常:站点改动后怎么部署

发布新版本**不需要**跑它:下载区在访客的浏览器里读 `latest.json`(读不到再读 GitHub Releases),版本号与下载链接随发布自动更新,两处部署都不用动,规则见 [transfer-site spec](https://github.com/aloong-planet/aloong-planet-home/blob/main/docs/specs/transfer-site.md)(在 aloong-planet-home)。只有站点代码、文案或样式改了才部署。

站点的改动在 aloong-planet-home 里做、合并。镜像不会跟着更新:合并之后再跑下面这条命令。

```bash
pnpm deploy:site:cn
```

一条命令完成克隆 → 构建(注入备案号)→ 同步 → 服务器侧修权限 → 自检。构建的是 aloong-planet-home **此刻的 main**(临时目录里一份全新的浅克隆,不是任何本地检出),开头会打印它构建的修订,据此确认那就是要上线的那一版。前提:本机有 git、pnpm,以及 aloong-planet-home 的 README 要求的 Node 版本,并且连得上 github.com。看到下面三行才算成功:

```
    后端 HTTP 200
    线上页面已含备案号
==> 完成:https://transfer.aloongplanet.com.cn
```

**首次使用前**:在仓库根建 `.deploy.env`(已 gitignore),写入部署目标:

```
DEPLOY_HOST=root@<ECS 公网 IP>
```

密钥默认取 `~/.ssh/aloongplanet_ecs`,要换用 `DEPLOY_KEY` 覆盖。服务器地址与密钥都不进仓库——这是公开仓库,硬编码等于对外公告该 IP 可 root SSH。

## 服务器上的形态

ECS 上还跑着 Harbor / Nginx Proxy Manager / Portainer 等既有服务(可用内存约 860MB,很紧)。落地页镜像**与它们共存,不得干扰**:

```
Nginx Proxy Manager (占宿主 80/443,管 TLS 证书)
  └─ 反代 → 容器 aloongplanet-static
              ├─ :8080  →  /srv/www/aloongplanet   (个人主页)
              └─ :8081  →  /srv/www/transfer       (本站)
```

`aloongplanet-static` 是个 nginx:alpine 容器,**不发布任何宿主端口**,只加入 NPM 所在的 Docker 网络,由 NPM 按容器名反代。它的 nginx 配置在宿主机 `/srv/www/_conf/static-sites.conf`。

TLS 证书由 NPM 的 Let's Encrypt 集成签发与自动续期,不需要人工介入。

## 备案号

由构建期环境变量 `PUBLIC_ICP_BEIAN` 注入,值写在 `build/deploy-site-cn.sh` 里——**脚本自己保证注入,不依赖使用者记得 export**,靠人记得的合规约束等于没有约束。

三种输入三种归宿(实现在 aloong-planet-home 的 `apps/transfer/src/beian.ts`):

| 输入 | 结果 |
|---|---|
| 未设置 / 空串 / 纯空白 | 不渲染。`.com` 那份(aloong-planet-home 的 Deploy workflow 构建)就是这种情况 |
| 合法 | 渲染在页脚 |
| 设置了但格式非法 | **构建失败**。可选不等于随便写,写错的备案号是违规展示 |

部署脚本还会在同步前检查产物里确实含有备案号,漏注入时拒绝上传。

**公安联网备案号尚未申请**。ICP 通过后 30 天内需在 `beian.mps.gov.cn` 办理;号下来后与 ICP 号同样处理,在此之前**不显示占位号**——编造的备案号比不显示更糟。

## R2 的 CORS(统计行与最新版指针)

统计 JSON 和最新版指针 `latest.json` 都在 R2 上,与落地页不同源,两个域名都要在白名单里。策略是整个桶一份,覆盖这两个文件。策略文件是 `build/r2-download-stats-cors.json`,粘贴到 R2 → `transfer-releases` → Settings → CORS Policy。

验证(阴性对照不能省,否则分不清"白名单生效"和"桶对所有人开放"):

```bash
# 必须用 GET(-D - -o /dev/null)。-I 发的是 HEAD,而策略只允许 GET,
# HEAD 拿不到该响应头 —— 三个 origin 会齐刷刷"失败",看起来像 CORS 坏了。
for f in stats/downloads.json latest.json; do
  echo "== $f"
  for o in https://transfer.aloongplanet.com https://transfer.aloongplanet.com.cn https://example.com; do
    printf '%-42s ' "$o"
    curl -sS -D - -o /dev/null -H "Origin: $o" "https://dl.aloongplanet.com/$f" \
      | grep -i access-control-allow-origin || echo '(无该响应头)'
  done
done
```

每个文件的前两行应各自回显对应的 origin,**第三行必须是「无该响应头」**。

白名单缺失时,统计行**静默隐藏**,下载区读不到 `latest.json` 而**静默退到 GitHub 状态**(每行只剩一个指向 GitHub 的按钮;GitHub 也读不到时退到发布列表),页面其余部分完全正常——所以它坏了不会有任何告警,只能靠上面的命令主动验。Cloudflare Pages 的预览域名(`*.pages.dev`)不在白名单里,预览部署上读不到 `latest.json`,这是预期的,不要为此放宽白名单。

## 排查

| 症状 | 原因与处理 |
|---|---|
| 页面 403 | 文件权限。ECS 默认 umask 027 让新文件落成 640,容器里的 nginx(uid 101) 读不到。部署脚本已在服务器侧 `chmod -R a+rX`;手工传文件时要自己补 |
| `rsync: --chmod: invalid argument` | macOS 自带的是 openrsync,不认该参数。权限统一在服务器侧修,不要在客户端加 `--chmod` |
| 目录路径返回 403 而非 404 | nginx 的 `try_files` 里有 `$uri/` 兜底,会匹配到真实目录再因无目录索引变 403(等于泄露目录存在)。正确写法是 `try_files $uri $uri/index.html =404` |
| 统计行不显示 | 先按上面的命令验 CORS。其余失败模式(JSON 不存在、schema 不符)见 [download-statistics.md](download-statistics.md) |
| 下载区每行只有一个按钮(没有 R2 的"下载") | 浏览器没能用上 `latest.json`,页面退到了 GitHub 状态:先按上面的命令验它的 CORS,再看它本身是否可用(判据见 [transfer-site spec](https://github.com/aloong-planet/aloong-planet-home/blob/main/docs/specs/transfer-site.md) 的实现决策) |
| 证书过期 | NPM 自动续期。真过期时进 NPM 后台该 Proxy Host 的 SSL 页重签 |

## 本机测试不可信

开发机常驻 TUN 模式代理,劫持系统解析器并对任意目标返回连接成功。**`nc` / `curl` / `dig` 在本机给出的连通性结论一律不作数**——曾据此得出过"安全组已放行"的错误结论,把排查方向带偏很久。

要判断线上可达性,用这三条之一:服务端抓包(`tcpdump` 看对端 SYN 有没有到)+ 读 NPM 访问日志、境外视角取回、手机蜂窝流量实测(同时验大陆访问与备案)。
