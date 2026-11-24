# ADR-0018: The landing page goes to a mainland node, the download source stays on R2

- Status: Accepted (2026-08-04)

## Context

Cloudflare Pages and R2 have no ICP filing and are not served from mainland nodes, so mainland users reach both the landing page and the installers by routing abroad (ADR-0011). `aloongplanet.com.cn` has an ICP filing and its own ECS with a reverse proxy and certificate, so one more landing-page deployment there costs almost nothing. How much should move: the landing page, the download source, or both?

## Options

1. **Move only the landing page to the mainland node and leave the download source alone: one code base built twice, differing only in the footer's ICP filing number, with the installers staying on Cloudflare R2**
2. Move the landing page and the download source together (the installers onto Alibaba Cloud OSS and CDN) — rejected: R2 egress is free while OSS bills by traffic, an open exposure while the download volume is unknown, and moving both at once leaves no way to tell which half got faster.
3. Move nothing and keep only `.com` — rejected: the filing and the ECS are already paid for, and leaving mainland users to route abroad wastes them.
4. Automated deployment (GitHub Actions pushing to the ECS) — deferred: allowing Actions' egress IPs is physically infeasible (7,297 published ranges, about 27.9 million IPv4 addresses, against a security-group cap of one or two hundred rules), a self-hosted runner risks pushing the Harbor on the same machine out of memory (about 860 MB available), an OSS relay works but adds a moving part, and with 10 changes to the landing page in three weeks it is not worth it. **Restart when** the change frequency rises markedly, or the ECS memory is expanded and a self-hosted runner is worth re-evaluating.

## Decision

We choose **option 1**: we deploy the landing page to the filed mainland node and keep the download source as it is, Cloudflare R2 first with GitHub Releases as the fallback. Both deployments share one code base, with no branch or forked code, and differ only in the ICP filing number in the mainland footer; the mainland site is deployed by a manual script.

## Consequences

- Positive: Mainland users open the landing page from a mainland node, so the first screen no longer routes abroad.
- Positive: Both sites are built from one source, so one change to the copy updates both and they do not drift apart into two sites over time.
- Negative: **Download speed does not change at all.** The installers stay on R2, which has no filing, so mainland downloads still route abroad, and "the domestic mirror is live" is easily misread as "downloads are fast too", the misreading this entry most needs to prevent (ADR-0011's option 3 is only half carried out).
- Negative: One more deployment has to be maintained, and it is deployed by hand.
- Negative: When R2's CORS allow-list lacks the mainland site's origin, the statistics line is hidden and the download section falls back to the GitHub state or the list state (`landing-page::REQ-002`).
- Neutral: Two domains serve the same content, which raises a duplicate-content question for search engines; the landing page has neither a canonical link nor a sitemap, and none is added for this.

## Sources

- ADR-0011: the measurement that Cloudflare without a filing is not served from mainland nodes, and its option 3 (an ICP filing and a mainland cloud node), which this entry takes up.
- The numbers in option 4: the count of egress ranges GitHub publishes for Actions and the change frequency of `site/` are from the survey of 2026-08-04; the ECS's available memory has no recorded date.
