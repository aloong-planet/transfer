// The decisions behind Transfer's Electron security baseline (docs/specs/electron-security.md, ADR-0025), against their
// bypass vectors. The wiring that feeds them real URLs, frames and permissions is held by e2e/electron-security.spec.ts.
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
  it('registers every IPC handler through the sender check (electron-security::CON-003/AC-01)', () => {
    const sources = mainSources()
    expect(sources.length).toBeGreaterThan(10)
    const direct = sources.filter(({ path, text }) => path !== 'web-guards.ts' && text.includes('ipcMain.handle('))
    expect(direct.map(({ path }) => path)).toEqual([])
  })

  it('creates no window with its sandbox or Node integration switched on the wrong way (electron-security::CON-005)', () => {
    const offending = mainSources().filter(({ text }) => /sandbox:\s*false|nodeIntegration:\s*true/.test(text))
    expect(offending.map(({ path }) => path)).toEqual([])
  })
})
