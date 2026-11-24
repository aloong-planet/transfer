# Landing page

> Related: [landing-page-deploy](landing-page-deploy.md) (the same page built for two hosts)

## Problem Statement
A visitor on Transfer's website has no way to reach the author's homepage, where the author's other apps and tools are listed. Visitors also open the website on narrow phones, where a page wider than the screen has to be scrolled sideways. Releases follow one another, and a visitor who wants to download Transfer has to be offered the current formal release each time, without anyone editing the website.

## Solution
The header's left end reads "aloong planet / Transfer", and "aloong planet" opens the homepage. Every page fits the width of a phone's screen. The download section offers the current formal release, read in the visitor's browser when the page opens, so publishing a release needs no website change; when no release can be read, the section leads to GitHub's release list.

## Functional Requirements

### landing-page::REQ-001 Back to the aloong planet homepage

- landing-page::REQ-001/AC-01: On every page of the website (the landing page and the privacy page, in both languages), the header's left end shows, in order, "aloong planet", the separator "/" and the brand (icon and name). "aloong planet" is a link that opens `https://aloongplanet.com/` in the current tab; the "/" is not a link and assistive technology does not read it; the brand keeps its link to the page's own home. Both languages show "aloong planet", untranslated.
- landing-page::REQ-001/AC-02: "aloong planet" and "/" take the size and grey of the header's navigation links, with 10px between each of the three ("aloong planet", "/", the brand); in the narrow window of landing-page::REQ-001/AC-03, "aloong planet" and "/" are 4px apart. Hovering "aloong planet" turns it the navigation links' hover colour, without an underline.
- landing-page::REQ-001/AC-03: In a window 400px wide or narrower, "aloong planet /" shrinks to 11px, with a line height 1.3 times that size, on its own line 1px above the brand's line; the header keeps its height and the language switch stays at the right.

### landing-page::REQ-002 Which download the section offers

- landing-page::REQ-002/AC-01: **R2 state.** When the visitor's browser reads a usable latest-release pointer (see Implementation Decisions), the download section shows the version line ("Current version", then `v` and the pointer's version) and five rows: macOS for Apple Silicon, for Intel and Universal; Windows installer and portable. Each row has two buttons: the file on the download host, which downloads in place, and the same file on GitHub, which opens in a new tab.
- landing-page::REQ-002/AC-02: **GitHub state.** When the pointer gives no usable release and GitHub gives one (see Implementation Decisions), the section shows the version line with that release's version and the same five rows, each with one button: the file on GitHub, which opens in a new tab.
- landing-page::REQ-002/AC-03: **List state.** When neither gives a usable release, the section shows no version line and no rows, only one button, "Download on GitHub" ("前往 GitHub 下载" on the Chinese page), which opens `https://github.com/aloong-planet/transfer/releases/latest` in a new tab.
- landing-page::REQ-002/AC-04: As delivered, that is before any read has finished and for a visitor who does not run scripts, the section is in the list state.
- landing-page::REQ-002/AC-05: Publishing a release, of any version, needs no edit to or redeploy of the website: the version and every file link the section shows come from the reads.
- landing-page::REQ-002/AC-06: Which sources the section shows depends only on its state. The page never chooses or hides a source, and never redirects, by where it guesses the visitor to be (browser language, time zone or the like); the Chinese page and the English page offer the same sources in each state.

## Quality Requirements

### landing-page::QR-001 Narrow windows

Applies to: every page of the website (the landing page and the privacy page), in both languages, and the landing page's download section in each state of landing-page::REQ-002.

- landing-page::QR-001/AC-01: In a window 320px wide or wider, the page does not scroll sideways: it is no wider than the window.
- landing-page::QR-001/AC-02: In a window 320px wide or wider, the text and icon of each of the landing page's feature cards show whole and inside their card, and no card overlaps another.

## Failure modes and boundaries
- The mainland copy ([landing-page-deploy](landing-page-deploy.md)) shows the same link to `https://aloongplanet.com/`.

**Deciding the download**

- A1 The pointer cannot be read (blocked cross-origin, a network failure, no answer in time, a status other than 200, a body that is not JSON) or is not usable → the page reads GitHub (landing-page::REQ-002/AC-02). A usable pointer wins over GitHub, including when GitHub has a newer release. The page never guesses a version.
- A2 GitHub cannot be read (rate limit, an error, no answer in time), has no published formal release, or its newest one lacks one of the five files or has one whose upload has not finished → the list state (landing-page::REQ-002/AC-03). An older release is not offered in its place.
- A3 A release is being published: the pointer is updated only after the release's files are on the download host, so until then the page offers the previous release (landing-page::REQ-002/AC-01).
- A4 A read finishes after the page is shown → the state replaces the list state in place. When the download section is above the part of the page the visitor is looking at (a section hidden under the header counts as above), the page scrolls by as much as the change moved the content below it, so what the visitor is looking at does not move; when the section is in view, it changes in place.
- E1 The pointer and GitHub's answer are outside data. Only a validated version reaches the page, as text and in links whose hosts and paths the page fixes; no name, URL or release note from an answer is ever shown or linked.

## Implementation Decisions

- **Release files.** The release build names a version's five files `Transfer-<version>-mac-arm64.dmg`, `Transfer-<version>-mac-x64.dmg`, `Transfer-<version>-mac-universal.dmg`, `Transfer-<version>-win-setup.exe` and `Transfer-<version>-win-portable.exe`. A file counts only under exactly that name.
- **Latest-release pointer.** `https://dl.aloongplanet.com/latest.json`, written by the release workflow as `{ version, releasedAt, files: [{ name, size, os, arch, variant? }] }`. It is usable only when it answers 200 with a JSON object whose `version` is `major.minor.patch` digits with no suffix and whose `files` array has an entry for each of the five names of that version; entries and fields beyond those are ignored. Otherwise the whole pointer is unusable.
- **GitHub read.** One unauthenticated request to the public releases list of `aloong-planet/transfer`, asking for the first hundred. A release counts when it is published (not a draft), is not a pre-release and has a tag of `v` followed by `major.minor.patch`. The newest counting release by publish date, whatever order the list comes in, is the one considered; it is usable only when each of the five names matches an asset whose upload has finished.
- **Reads.** Both reads give up after five seconds and add no request header that would need a CORS preflight.
- **Links.** A file on the download host is `https://dl.aloongplanet.com/releases/v<version>/<name>`; on GitHub it is `https://github.com/aloong-planet/transfer/releases/download/v<version>/<name>`.

## Out of Scope
- A homepage address of its own for the mainland copy: the mainland copy gets no special handling here.
- The homepage's Apps and Agents menus in the header: the header only links back to the homepage (landing-page::REQ-001).
