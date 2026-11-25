# Landing page footer (ICP filing number)

## Question

The same landing-page code is deployed to two domains, and the mainland one shows one more item, an ICP filing number. Where in the footer does it go so that it neither squeezes the row of product links nor mixes legal information in with them? Does the placement hold in Chinese and English, light and dark, and on a narrow screen?

A simplified section above the footer is context only; the footer is not judged in isolation.

## Structure basis

The footer is drawn as the site has it: the brand on the left, the product links on the right, the two ends aligned. The filing number is the new item. Its placement is the direction the user confirmed: no row of its own, but the third item of the footer row, between the brand and the links, smaller than the product links and in a muted foreground colour. Without the number (the `.com` build) the item does not exist and the footer is the two-end layout.

## Demo scaffolding

Not part of the design; do not implement.

- A floating "Demo ·" bar (the shared demo bar, which can be dragged or collapsed) has one group, Build target, that switches between `.com` (Pages) and `.com.cn` (ECS): the real site decides at build time from an environment variable and has no such control. `.com` (Cloudflare Pages) sets none and the whole row is absent; `.com.cn` (Aliyun ECS) sets it and the row renders.

The page follows the gallery's language and mode settings, so the four combinations of language and mode are seen by changing them there.
