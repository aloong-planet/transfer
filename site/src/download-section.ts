// The download section's script (landing-page::REQ-002): reads the latest-release pointer and, only when it cannot offer
// a release, GitHub's releases; decides which state the section is in; and shows it in place over the list state the
// page was delivered in (landing-page::REQ-002/AC-04). The list state needs no change: it is what the page already shows.
//
// Whatever reaches the page here is a version the readers validated (landing-page failure E1): the links are built from
// it and the hosts fixed in download-config.ts, and the text set is the version with a `v`, never an answer's own words.
import { sources, VARIANTS } from './download-config'
import { readGitHub, readPointer, type Fetch } from './releases'

export type DownloadState = { kind: 'r2'; version: string } | { kind: 'github'; version: string } | { kind: 'list' }

type ReleaseState = Exclude<DownloadState, { kind: 'list' }>

interface Link {
  href: string
  /** GitHub's links open in a new tab; the file on the download host downloads in place */
  newTab: boolean
}

/** The links of one variant's row: the primary button, and the secondary one when the state has a second source */
function linksFor(state: ReleaseState, fileName: string): { primary: Link; secondary: Link | null } {
  const { r2, github } = sources(fileName, state.version)
  return state.kind === 'r2'
    ? { primary: { href: r2, newTab: false }, secondary: { href: github, newTab: true } }
    : { primary: { href: github, newTab: true }, secondary: null }
}

function setLink(anchor: Element, link: Link | null): void {
  anchor.toggleAttribute('hidden', link === null)
  if (!link) return
  anchor.setAttribute('href', link.href)
  if (link.newTab) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener')
  } else {
    anchor.removeAttribute('target')
    anchor.removeAttribute('rel')
  }
}

/** Shows a release state over the delivered list state: the version line, the five rows, and no list button */
function applyState(doc: Document, state: ReleaseState): void {
  const version = doc.querySelector('[data-download-version]')
  const versionValue = doc.querySelector('[data-download-version-value]')
  const rows = doc.querySelector('[data-download-rows]')
  const list = doc.querySelector('[data-download-list]')
  const buttons = VARIANTS.map((variant) => {
    const row = doc.querySelector(`[data-download-row="${variant.id}"]`)
    return {
      fileName: variant.fileName(state.version),
      primary: row?.querySelector('[data-download-link="primary"]'),
      secondary: row?.querySelector('[data-download-link="secondary"]'),
    }
  })
  // A page missing any of its parts is left as delivered, never half changed
  if (!version || !versionValue || !rows || !list || buttons.some((b) => !b.primary || !b.secondary)) return

  versionValue.textContent = `v${state.version}`
  for (const { fileName, primary, secondary } of buttons) {
    const links = linksFor(state, fileName)
    setLink(primary!, links.primary)
    setLink(secondary!, links.secondary)
  }
  version.removeAttribute('hidden')
  rows.removeAttribute('hidden')
  list.setAttribute('hidden', '')
}

/**
 * Makes a change to the download section without moving what the visitor is looking at, when the section is above
 * the part of the page they are looking at (landing-page failure A4): the state lands after the page is shown, and
 * the section's height depends on the state, so the content below it moves. The part they are looking at starts
 * below the sticky header, so a section hidden under the header counts as above. Some browsers keep the place
 * themselves (scroll anchoring) and some do not; what the change moved is measured afterwards and scrolled away
 * if it is still there, so this works either way. While the section is in view, it changes in view.
 */
function keepPlace(doc: Document, change: () => void): void {
  const section = doc.getElementById('download')
  if (!section) return change()
  const viewTop = doc.querySelector('header')?.getBoundingClientRect().bottom ?? 0
  const before = section.getBoundingClientRect().bottom
  change()
  const moved = section.getBoundingClientRect().bottom - before
  if (before <= viewTop && moved !== 0) doc.defaultView?.scrollBy({ top: moved, behavior: 'instant' })
}

/**
 * Reads what the page can offer and shows it; resolves to the state the section ends in.
 *
 * The state alone decides which sources are shown (landing-page::REQ-002/AC-06): nothing here looks at the browser's
 * language, time zone or any other sign of where the visitor is, because such a guess about a region is unreliable
 * and a VPN upsets it.
 */
export async function initDownload(doc: Document, fetch: Fetch): Promise<DownloadState> {
  const pointer = await readPointer(fetch)
  const github = pointer === null ? await readGitHub(fetch) : null
  const state: DownloadState = pointer
    ? { kind: 'r2', version: pointer }
    : github
      ? { kind: 'github', version: github }
      : { kind: 'list' }
  if (state.kind !== 'list') keepPlace(doc, () => applyState(doc, state))
  return state
}
