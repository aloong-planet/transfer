// The landing page, rendered as delivered: the header's link back to the aloong planet homepage
// (landing-page::REQ-001/AC-01) and the download section (landing-page::REQ-002).
//
// Gap: landing-page::REQ-001/AC-02, landing-page::REQ-001/AC-03, landing-page::QR-001/AC-01 and
// landing-page::QR-001/AC-02 (sizes, colours, gaps, hover and the narrow-window layout), and
// landing-page::QR-001/AC-01 for the download section's states, are not tested here. They are
// computed styles and geometry, which only a browser can read, and the site has no browser test
// runner. The one computed style read here is whether a part of the download section has a box at
// all (display), on the built page with its stylesheets; sizes and positions are not.
//
// Gap: the script in Download.astro that hands the browser's own fetch to initDownload runs only in
// a browser, so these tests call initDownload with a stand-in network instead. Whether the built
// page's script reaches it is checked on the preview deployment.
//
// Gap: landing-page failure A3 (the pointer is written only after the release's files are on the
// download host) belongs to the release workflow, .github/workflows/build.yml, not to the site: its
// upload step puts the installers on R2 first and latest.json last. It can be tested once a test can run
// that step against a stand-in bucket and see that a failed installer upload leaves latest.json
// unwritten; the site's suite has no such runner.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { Window } from 'happy-dom'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { initDownload } from './download-section'
import latestSample from './fixtures/latest.json'
import releasesSample from './fixtures/github-releases.json'
import type { Fetch } from './releases'
import EnLanding from './pages/en/index.astro'
import EnPrivacy from './pages/en/privacy.astro'
import ZhLanding from './pages/index.astro'
import ZhPrivacy from './pages/privacy.astro'

type Page = Parameters<AstroContainer['renderToString']>[0]

let container: AstroContainer
const window = new Window()
const openWindows: Window[] = []
const delivered = new Map<Page, string>()

beforeAll(async () => {
  container = await AstroContainer.create()
})

afterAll(async () => {
  await Promise.all([window, ...openWindows].map((w) => w.happyDOM.close()))
})

/** The document of a browser window that has been delivered the page's HTML and runs none of its scripts */
async function openPage(page: Page): Promise<Document> {
  let html = delivered.get(page)
  if (html === undefined) {
    html = await container.renderToString(page)
    delivered.set(page, html)
  }
  const opened = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } })
  opened.document.write(html)
  openWindows.push(opened)
  // happy-dom stands in for the browser here; its types do not claim to be the DOM library's, which the site's code is typed against
  return opened.document as unknown as Document
}

async function renderHeader(page: Parameters<AstroContainer['renderToString']>[0]) {
  const html = await container.renderToString(page)
  const doc = new window.DOMParser().parseFromString(html, 'text/html')
  const headers = doc.querySelectorAll('header')
  expect(headers.length, 'one site header').toBe(1)
  return headers[0]
}

describe('site header', () => {
  test.each([
    { page: 'Chinese landing page', component: ZhLanding, ownHome: '/' },
    { page: 'Chinese privacy page', component: ZhPrivacy, ownHome: '/' },
    { page: 'English landing page', component: EnLanding, ownHome: '/en' },
    { page: 'English privacy page', component: EnPrivacy, ownHome: '/en' },
  ])(
    'the $page starts with the aloong planet link, a separator hidden from assistive technology, then the brand',
    async ({ component, ownHome }) => {
      const header = await renderHeader(component)
      const [homepage, brand] = header.querySelectorAll('a')

      expect(homepage.textContent?.trim()).toBe('aloong planet')
      expect(homepage.getAttribute('href')).toBe('https://aloongplanet.com/')
      // Opens in the current tab, unlike the header's GitHub link.
      expect(homepage.hasAttribute('target')).toBe(false)

      expect(brand.textContent?.trim()).toBe('Transfer')
      expect(brand.querySelector('img')).not.toBeNull()
      expect(brand.getAttribute('href')).toBe(ownHome)

      const separators = [...header.querySelectorAll('*')].filter(
        (el) => el.children.length === 0 && el.textContent?.trim() === '/',
      )
      expect(separators).toHaveLength(1)
      const [separator] = separators
      expect(separator.closest('a')).toBeNull()
      expect(separator.closest('[aria-hidden="true"]')).not.toBeNull()
      // In reading order, and neither inside the other.
      expect(homepage.compareDocumentPosition(separator)).toBe(window.Node.DOCUMENT_POSITION_FOLLOWING)
      expect(separator.compareDocumentPosition(brand)).toBe(window.Node.DOCUMENT_POSITION_FOLLOWING)
    },
  )
})

const RELEASES_LATEST = 'https://github.com/aloong-planet/transfer/releases/latest'

/** The text a visitor can read in a node: nothing from an element marked hidden, a style or a script */
function visibleText(node: Node): string {
  if (node.nodeType === window.Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== window.Node.ELEMENT_NODE) return ''
  const element = node as Element
  if (element.hasAttribute('hidden') || ['STYLE', 'SCRIPT'].includes(element.tagName)) return ''
  return [...element.childNodes].map(visibleText).join(' ')
}
const words = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** The links a visitor can follow in a node: those with no hidden element around them and somewhere to go */
const shownLinks = (node: Element): Element[] => [...node.querySelectorAll('a[href]')].filter((a) => !a.closest('[hidden]'))

describe('the download section as delivered', () => {
  test.each([
    { page: 'Chinese', component: ZhLanding, title: '下载 Transfer', button: '前往 GitHub 下载' },
    { page: 'English', component: EnLanding, title: 'Download Transfer', button: 'Download on GitHub' },
  ])(
    'the $page landing page is in the list state: its title and one button to GitHub, no version, no rows (landing-page::REQ-002/AC-03, landing-page::REQ-002/AC-04)',
    async ({ component, title, button }) => {
      const document = await openPage(component)
      const section = document.querySelector('#download')!

      expect(words(visibleText(section))).toBe(`${title} ${button}`)
      const links = shownLinks(section)
      expect(links.map((a) => a.getAttribute('href'))).toEqual([RELEASES_LATEST])
      expect(links[0].getAttribute('target')).toBe('_blank')
      // Nothing in the delivered section, hidden or not, names a version or points at a file
      expect(section.innerHTML).not.toMatch(/\d+\.\d+\.\d+/)
      expect(section.innerHTML).not.toContain('/releases/download/')
    },
  )
})

/** What the download host answers for a file it does not have: a 404 with an HTML page */
const NOT_FOUND_PAGE = '<!doctype html>\n<html lang="en"><head><title>Not Found</title></head><body></body></html>\n'
const POINTER_URL = 'https://dl.aloongplanet.com/latest.json'
const RELEASES_API = 'https://api.github.com/repos/aloong-planet/transfer/releases?per_page=100'

/** The pointer as the release workflow writes it, for another version */
const pointerFor = (version: string): string => JSON.stringify(latestSample).replaceAll('1.2.3', version)

/** A network that answers each URL as given and fails any other; it records the URLs asked */
function network(answers: Record<string, [number, string]>): Fetch & { asked: string[] } {
  const asked: string[] = []
  const fetch: Fetch = (url) => {
    asked.push(url)
    const answer = answers[url]
    return answer ? Promise.resolve(new Response(answer[1], { status: answer[0] })) : Promise.reject(new TypeError('Failed to fetch'))
  }
  return Object.assign(fetch, { asked })
}

/** The links of the download section's rows as a visitor sees them: label, address and whether it opens a new tab */
const rowLinks = (section: Element): [string, string | null, string | null][] =>
  shownLinks(section).map((a) => [words(a.textContent ?? ''), a.getAttribute('href'), a.getAttribute('target')])

describe('the download section once a read has given a release', () => {
  test('the pointer names a version the build has never seen: that version and its files, from the download host and from GitHub (landing-page::REQ-002/AC-01, landing-page::REQ-002/AC-05)', async () => {
    const document = await openPage(EnLanding)
    const net = network({ [POINTER_URL]: [200, pointerFor('9.9.9')], [RELEASES_API]: [200, JSON.stringify(releasesSample)] })

    expect(await initDownload(document, net)).toEqual({ kind: 'r2', version: '9.9.9' })

    const section = document.querySelector('#download')!
    expect(words(visibleText(section))).toBe(
      'Download Transfer Current version: v9.9.9 ' +
        'macOS Apple Silicon Download GitHub Intel Download GitHub Universal (pick this if unsure) Download GitHub ' +
        'Windows Installer (Setup) Download GitHub Portable Download GitHub',
    )
    const download = 'https://dl.aloongplanet.com/releases/v9.9.9/'
    const github = 'https://github.com/aloong-planet/transfer/releases/download/v9.9.9/'
    const files = [
      'Transfer-9.9.9-mac-arm64.dmg',
      'Transfer-9.9.9-mac-x64.dmg',
      'Transfer-9.9.9-mac-universal.dmg',
      'Transfer-9.9.9-win-setup.exe',
      'Transfer-9.9.9-win-portable.exe',
    ]
    // The download host's file opens in place, GitHub's in a new tab
    expect(rowLinks(section)).toEqual(
      files.flatMap((file) => [
        ['Download', download + file, null],
        ['GitHub', github + file, '_blank'],
      ]),
    )
    // The pointer was enough: GitHub was never asked
    expect(net.asked).toEqual([POINTER_URL])
  })

  test('no pointer yet: the newest formal release on GitHub, each file with the one button to GitHub (landing-page::REQ-002/AC-02)', async () => {
    const document = await openPage(EnLanding)
    const net = network({ [POINTER_URL]: [404, NOT_FOUND_PAGE], [RELEASES_API]: [200, JSON.stringify(releasesSample)] })

    expect(await initDownload(document, net)).toEqual({ kind: 'github', version: '1.2.3' })

    const section = document.querySelector('#download')!
    expect(words(visibleText(section))).toBe(
      'Download Transfer Current version: v1.2.3 ' +
        'macOS Apple Silicon Download Intel Download Universal (pick this if unsure) Download ' +
        'Windows Installer (Setup) Download Portable Download',
    )
    const github = 'https://github.com/aloong-planet/transfer/releases/download/v1.2.3/'
    expect(rowLinks(section)).toEqual(
      [
        'Transfer-1.2.3-mac-arm64.dmg',
        'Transfer-1.2.3-mac-x64.dmg',
        'Transfer-1.2.3-mac-universal.dmg',
        'Transfer-1.2.3-win-setup.exe',
        'Transfer-1.2.3-win-portable.exe',
      ].map((file) => ['Download', github + file, '_blank']),
    )
    // GitHub is asked only after the pointer has failed
    expect(net.asked).toEqual([POINTER_URL, RELEASES_API])
  })

  // Visitors a guess about where the visitor is would tell apart: a browser language and a time zone that agree on a
  // place, and that disagree (a VPN, a trip)
  const visitors = [
    { language: 'zh-CN', timeZone: 'Asia/Shanghai' },
    { language: 'en-US', timeZone: 'America/New_York' },
    { language: 'ja-JP', timeZone: 'Asia/Tokyo' },
    { language: 'zh-CN', timeZone: 'America/Los_Angeles' },
    { language: 'en-US', timeZone: 'Asia/Shanghai' },
  ]

  /** Runs `body` as a visitor whose browser says it speaks `language` and is in `timeZone` */
  async function asVisitor<T>({ language, timeZone }: (typeof visitors)[number], body: () => Promise<T>): Promise<T> {
    const zone = process.env.TZ
    vi.stubGlobal('navigator', { language, languages: [language] })
    process.env.TZ = timeZone
    try {
      return await body()
    } finally {
      vi.unstubAllGlobals()
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
  }

  test.each([
    ['R2', () => network({ [POINTER_URL]: [200, pointerFor('9.9.9')] }), 10],
    ['GitHub', () => network({ [POINTER_URL]: [404, NOT_FOUND_PAGE], [RELEASES_API]: [200, JSON.stringify(releasesSample)] }), 5],
  ])(
    'every visitor is offered the same sources, on the Chinese and the English page, in the %s state, and the page stays where it is (landing-page::REQ-002/AC-06)',
    async (_, answers, linkCount) => {
      const offered: (string | null)[][][] = []
      for (const visitor of visitors) {
        for (const page of [ZhLanding, EnLanding]) {
          const document = await openPage(page)
          const address = document.location.href
          await asVisitor(visitor, () => initDownload(document, answers()))
          expect(document.location.href, `${visitor.language} in ${visitor.timeZone}: the address`).toBe(address)
          offered.push(rowLinks(document.querySelector('#download')!).map(([, href, target]) => [href, target]))
        }
      }
      expect(offered).toHaveLength(visitors.length * 2)
      expect(offered[0]).toHaveLength(linkCount)
      for (const each of offered) expect(each).toEqual(offered[0])
    },
  )

  test.each([
    ['neither place can be read', network({})],
    [
      'the pointer is not usable and GitHub has no formal release',
      network({ [POINTER_URL]: [200, pointerFor('1.2')], [RELEASES_API]: [200, JSON.stringify(releasesSample.filter((r) => r.prerelease))] }),
    ],
  ])('%s: the section stays as delivered, in the list state (landing-page::REQ-002/AC-03)', async (_, net) => {
    const document = await openPage(EnLanding)
    const section = document.querySelector('#download')!
    const delivered = section.outerHTML

    expect(await initDownload(document, net)).toEqual({ kind: 'list' })

    expect(section.outerHTML).toBe(delivered)
    expect(net.asked).toEqual([POINTER_URL, RELEASES_API])
  })
})

// Which parts of the download section a visitor gets a box for, on the page as `astro build` writes it. The delivered
// markup and the states both rely on `hidden`, and the buttons and the rows' grid set their own display, which the
// section's stylesheet has to override: a section that carries the right attributes but not the rule looks wrong
// while every attribute test above stays green. The Container renders no stylesheets, so the site is built once, into
// a temporary directory.
describe('the download section as the built page lays it out', () => {
  let builtSite = ''

  beforeAll(() => {
    const siteRoot = new URL('../', import.meta.url)
    builtSite = mkdtempSync(join(tmpdir(), 'landing-page-test-'))
    execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/astro/astro.js', siteRoot)), 'build', '--outDir', builtSite], {
      cwd: fileURLToPath(siteRoot),
      stdio: 'pipe',
    })
  }, 120_000)

  afterAll(() => {
    if (builtSite) rmSync(builtSite, { recursive: true, force: true })
  })

  /** The built English landing page in a browser window that applies its stylesheets and runs none of its scripts */
  function openBuilt(): Document {
    const html = readFileSync(join(builtSite, 'en', 'index.html'), 'utf8')
    const linked = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"[^>]*>/g)].map(([, href]) => readFileSync(join(builtSite, href), 'utf8'))
    const opened = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } })
    opened.document.write(html.replace(/<link rel="stylesheet"[^>]*>/g, ''))
    const stylesheet = opened.document.createElement('style')
    stylesheet.textContent = linked.join('\n')
    opened.document.head.appendChild(stylesheet)
    openWindows.push(opened)
    return opened.document as unknown as Document
  }

  /** Whether the element is laid out: neither it nor anything around it is `display: none` */
  function hasBox(element: Element): boolean {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (node.ownerDocument.defaultView!.getComputedStyle(node).display === 'none') return false
    }
    return true
  }

  const boxes = (document: Document, selector: string): boolean[] => [...document.querySelectorAll(selector)].map(hasBox)
  const five = (has: boolean): boolean[] => Array<boolean>(5).fill(has)

  test.each([
    { state: 'as delivered, before any read', ac: 'landing-page::REQ-002/AC-04', net: null, list: true, rows: false, primary: false, secondary: false },
    {
      state: 'the GitHub state',
      ac: 'landing-page::REQ-002/AC-02',
      net: () => network({ [POINTER_URL]: [404, NOT_FOUND_PAGE], [RELEASES_API]: [200, JSON.stringify(releasesSample)] }),
      list: false,
      rows: true,
      primary: true,
      secondary: false,
    },
    { state: 'the R2 state', ac: 'landing-page::REQ-002/AC-01', net: () => network({ [POINTER_URL]: [200, pointerFor('9.9.9')] }), list: false, rows: true, primary: true, secondary: true },
  ])('$state: only the parts that state shows have a box ($ac)', async ({ net, list, rows, primary, secondary }) => {
    const document = openBuilt()
    if (net) await initDownload(document, net())

    expect({
      list: boxes(document, '[data-download-list]'),
      version: boxes(document, '[data-download-version]'),
      rows: boxes(document, '[data-download-rows]'),
      primary: boxes(document, '[data-download-link="primary"]'),
      secondary: boxes(document, '[data-download-link="secondary"]'),
    }).toEqual({
      list: [list],
      version: [rows],
      rows: [rows],
      primary: five(primary),
      secondary: five(secondary),
    })
  })
})

// Keeping the visitor's place when a state lands after the page is shown (landing-page failure A4). happy-dom has no
// layout, so the rectangles are stubbed: the header ends at 64, and the download section's bottom edge moves by `shift`
// once the version line is shown (that is how the stub knows the state has landed). Not covered: that a real browser's
// layout moves the way the stub says it does.
describe('a state that lands after the page is shown', () => {
  const HEADER_BOTTOM = 64

  async function scrolledPage(sectionBottom: number, shift: number) {
    const document = await openPage(EnLanding)
    const landed = (): boolean => !document.querySelector('[data-download-version]')!.hasAttribute('hidden')
    const rect = (top: number, bottom: number) => () => ({ top, bottom }) as DOMRect
    document.querySelector('header')!.getBoundingClientRect = rect(0, HEADER_BOTTOM)
    document.querySelector('#download')!.getBoundingClientRect = () =>
      ({ top: sectionBottom - 400, bottom: landed() ? sectionBottom + shift : sectionBottom }) as DOMRect
    const scrolls: unknown[] = []
    document.defaultView!.scrollBy = ((options: unknown) => void scrolls.push(options)) as typeof scrollBy
    await initDownload(document, network({ [POINTER_URL]: [200, pointerFor('9.9.9')] }))
    return scrolls
  }

  test.each([
    ['above the part of the page the visitor is looking at, and taller', 40, 30, [{ top: 30, behavior: 'instant' }]],
    ['above it, and shorter: the scroll goes the other way', 40, -25, [{ top: -25, behavior: 'instant' }]],
    ['hidden under the header, its bottom edge exactly on the header’s', HEADER_BOTTOM, 30, [{ top: 30, behavior: 'instant' }]],
    ['in view: it changes in place', HEADER_BOTTOM + 1, 30, []],
    ['above it, but moving nothing', 40, 0, []],
  ])('the download section %s', async (_, sectionBottom, shift, expected) => {
    expect(await scrolledPage(sectionBottom, shift)).toEqual(expected)
  })
})
