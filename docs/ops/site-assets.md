# Website assets

Transfer's website is built from the aloong-planet-home repository (`apps/transfer/`). It takes two things from the app:
the screenshot of the landing page's hero (`screenshots/main.png`) and the icon, which the site serves as its favicon
(`favicon.svg`). They change there only through a pull request that this repository's command opens
(aloong-planet-home `app-sites::REQ-004/AC-01`); nobody edits them in that repository by hand.

## Sending new assets

```sh
pnpm site:assets --shots <directory>             # opens the pull request
pnpm site:assets --shots <directory> --dry-run   # stops after the local commit and prints what it would send
```

The directory holds the retaken screenshot, exactly one file, `main.png`, a whole PNG of 1800×1280 pixels. Anything
missing, extra, damaged or of another size stops the run before anything else starts, and every problem is listed. The
icon is `build/icon.svg`, copied byte for byte: it must be committed, because the pull request names this repository's HEAD
as the source of the assets, and it must be an SVG, because the site serves it as its favicon.

The command asks `gh` who is logged in and makes its commit as that account, under the account's GitHub noreply address
(`<id>+<login>@users.noreply.github.com`); the computer's own git identity and the git variables of the environment are not
used, since the commit stays public. It clones the website repository into a temporary directory, writes the two files
under `apps/transfer/public/`, and checks that those are the only paths changed or staged; then it commits on the branch
`assets/transfer-<date>-<commit>` (`-2`, `-3` and so on after it when the website repository already has that name), pushes
it and opens the pull request with `gh`. When both files are already what the website has, it says so and opens nothing.
A failed run keeps its clone and names it. The command never merges the pull request.

## The screenshot

It is the app's main window as the landing page's hero shows it, with the macOS window bar in the picture, taken by hand and
never by the command.

## Until the website is deployed from aloong-planet-home

The live website is then still built from `site/` in this repository, which holds its own copies of both files
(`site/public/screenshots/main.png`, `site/public/favicon.svg`). The command writes the copies in aloong-planet-home only,
so a change of the screenshot or of `build/icon.svg` made before the deployment switches has to be made in `site/public`
too, or the live website keeps the old one.

## An evidence run

`--title <text>` replaces the pull request's title and `--note <text>` adds a line at the top of its body. They are for a
run whose pull request is not meant to be merged, such as the one that shows the command works end to end: it says so in
both. The person who runs it closes the pull request and deletes its branch; the command does neither.
