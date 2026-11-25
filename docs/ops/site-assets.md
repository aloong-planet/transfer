# Website assets

Transfer's website is built and deployed from the aloong-planet-home repository (`apps/transfer/`) by that repository's
Deploy workflow; this repository has no site code. The site takes two things from the app: the screenshot of the landing page's hero (`screenshots/main.png`)
and the icon, which the site serves as its favicon (`favicon.svg`). In aloong-planet-home they change only through a pull
request that this repository's command opens (aloong-planet-home `app-sites::REQ-004/AC-01`); nobody edits them there by hand.
A new screenshot or icon reaches the live site once that pull request has merged and its deploy has finished.

## Sending new assets

```sh
pnpm site:assets --shots <directory>             # opens the pull request
pnpm site:assets --shots <directory> --dry-run   # stops after the local commit and prints what it would send
```

The directory holds the retaken screenshot, exactly one file, `main.png`, a PNG of 1800×1280 pixels. Anything missing,
extra, cut short, no PNG or of another size stops the run before anything else starts, and every problem is listed; the
picture's data is not read, so a file that is damaged in the middle passes (look at the screenshot before sending it). The
icon is `build/icon.svg`, copied byte for byte: it must be committed, and pushed, because the pull request names this
repository's HEAD as the source of the assets and the command does not check that GitHub has that commit, and it must be an
SVG, because the site serves it as its favicon.

The command asks `gh` who is logged in and makes its commit as that account, under the account's GitHub noreply address
(`<id>+<login>@users.noreply.github.com`); the computer's own git identity is not used, and the environment's
`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` are overridden with it, since the
commit stays public. It clones the website repository into a temporary directory, writes the two files
under `apps/transfer/public/`, and checks that those are the only paths changed or staged; then it commits on the branch
`assets/transfer-<date>-<commit>` (`-2`, `-3` and so on after it when the website repository already has that name), pushes
it and opens the pull request with `gh`. When both files are already what the website has, it says so and opens nothing.
A failed run keeps its clone and names it. The command never merges the pull request.

## The screenshot

It is the app's main window as the landing page's hero shows it, with the macOS window bar in the picture, taken by hand and
never by the command.

## An evidence run

`--title <text>` replaces the pull request's title and `--note <text>` adds a line at the top of its body. They are for a
run whose pull request is not meant to be merged, such as the one that shows the command works end to end: the person who
runs it says so in both, closes the pull request and deletes its branch; the command does neither.
