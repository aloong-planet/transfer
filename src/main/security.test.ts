// The decisions behind Transfer's Electron security baseline (docs/specs/electron-security.md, ADR-0025), against their
// bypass vectors, and static checks of rules the main process and the renderer must not bypass. The navigation guard, the
// window-open handler, the permission handlers and the IPC check on a foreign page are driven through real windows by
// e2e/electron-security.spec.ts.
//
// Known gaps:
// - The IPC wrapper turns Electron's sender frame into `isMainFrame` by `parent === null`. No case can drive that mapping
//   with a subframe: Transfer creates none, and its preload never runs in one (no `nodeIntegrationInSubFrames`). Add a
//   case if either changes.
// - The renderer scan reads Transfer's own source for a fixed list of sinks. A third-party component that turns received
//   text into links or markup is not seen by it; a link it made could still not navigate the window or open one
//   (electron-security::CON-001). Check any such component when it is added.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAppUrl, isTrustedSender, permissionGranted } from './security'

const DEV = 'http://localhost:5173/'

describe("the origin rule: is this one of Transfer's own pages (electron-security::CON-001)", () => {
  it.each(['app://bundle/index.html', 'app://bundle/overlay.html', 'app://bundle/', 'app://bundle'])(
    'accepts Transfer\'s own page in a packaged build: %s',
    (url) => {
      expect(isAppUrl(url)).toBe(true)
    }
  )

  it.each([
    'app://bundle.evil/',
    'app://evil/',
    'app://bundle@evil/',
    'app://evil@bundle/',
    'app://user:pass@bundle/',
    'file:///Users/a/evil.html',
    'http://bundle/',
    'https://bundle/',
    'data:text/html,<p>x</p>',
    'javascript:alert(1)',
    'about:blank',
    '',
    'not a url'
  ])('refuses anything else in a packaged build, however it starts: %s', (url) => {
    expect(isAppUrl(url)).toBe(false)
  })

  it('accepts the development server\'s pages from source, by origin', () => {
    expect(isAppUrl('http://localhost:5173/', DEV)).toBe(true)
    expect(isAppUrl('http://localhost:5173/overlay.html', DEV)).toBe(true)
  })

  it.each(['http://localhost:5173.evil.com/', 'http://localhost:5174/', 'https://localhost:5173/', 'http://evil@localhost:5173/', 'app://bundle/index.html'])(
    'refuses what only resembles the development server from source: %s',
    (url) => {
      expect(isAppUrl(url, DEV)).toBe(false)
    }
  )
})

describe('the permission decision (electron-security::CON-004)', () => {
  it("grants clipboard writing to Transfer's own pages", () => {
    expect(permissionGranted('clipboard-sanitized-write', 'app://bundle/overlay.html')).toBe(true)
    expect(permissionGranted('clipboard-sanitized-write', 'http://localhost:5173/', DEV)).toBe(true)
  })

  it('refuses clipboard writing to any other page', () => {
    expect(permissionGranted('clipboard-sanitized-write', 'http://127.0.0.1:9/')).toBe(false)
  })

  it.each(['media', 'notifications', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen', 'unknown'])(
    "refuses every other permission, even to Transfer's own pages: %s",
    (permission) => {
      expect(permissionGranted(permission, 'app://bundle/index.html')).toBe(false)
    }
  )
})

describe('the IPC sender decision (electron-security::CON-003/AC-02)', () => {
  it("trusts a main frame on Transfer's own page", () => {
    expect(isTrustedSender({ url: 'app://bundle/index.html', isMainFrame: true })).toBe(true)
    expect(isTrustedSender({ url: 'http://localhost:5173/', isMainFrame: true }, DEV)).toBe(true)
  })

  it("refuses a subframe, even on Transfer's own page", () => {
    expect(isTrustedSender({ url: 'app://bundle/index.html', isMainFrame: false })).toBe(false)
  })

  it.each(['file:///Users/a/evil.html', 'http://127.0.0.1:9/', 'about:blank'])('refuses a main frame on any other page: %s', (url) => {
    expect(isTrustedSender({ url, isMainFrame: true })).toBe(false)
  })

  it('refuses a call whose frame is already gone', () => {
    expect(isTrustedSender(null)).toBe(false)
  })
})

/** Every source file of the main process, tests excluded, by path relative to src/main */
function mainSources(): Array<{ path: string; text: string }> {
  const root = new URL('.', import.meta.url).pathname
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.fixture.ts'))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }))
}

describe('the wiring the main process may not bypass', () => {
  it('registers every IPC handler through the sender check, in every form Electron offers (electron-security::CON-003/AC-01)', () => {
    const sources = mainSources()
    expect(sources.length).toBeGreaterThan(10)
    // ipcMain and a web contents' own ipc object take the same listeners; a web contents also emits what a page sends
    const registration =
      /(ipcMain|\.ipc)\.(handle|handleOnce|on|once|addListener|prependListener|prependOnceListener)\(|['"]ipc-message(-sync)?['"]/
    const direct = sources.filter(({ path, text }) => path !== 'web-guards.ts' && registration.test(text))
    expect(direct.map(({ path }) => path)).toEqual([])
  })

  it('creates no window with its sandbox or Node integration switched on the wrong way (electron-security::CON-005)', () => {
    const offending = mainSources().filter(({ text }) => /sandbox:\s*false|nodeIntegration:\s*true/.test(text))
    expect(offending.map(({ path }) => path)).toEqual([])
  })
})

describe('what the renderer shows of another device\'s content', () => {
  it('has none of the raw-markup or embedding sinks in its own code', () => {
    const root = new URL('../renderer/', import.meta.url).pathname
    const sources = (readdirSync(root, { recursive: true }) as string[])
      .filter((path) => /\.(ts|tsx|html)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }))
    expect(sources.length).toBeGreaterThan(5)
    const sink = /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write\(|<a[\s>]|<iframe|<object|<embed|<webview/
    expect(sources.filter(({ text }) => sink.test(text)).map(({ path }) => path)).toEqual([])
  })
})
