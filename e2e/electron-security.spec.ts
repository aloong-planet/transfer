// e2e: the wiring of the Electron security baseline (docs/specs/electron-security.md, ADR-0025), through real windows:
// the navigation guard and the window-open handler on the main window, the page-level drop guard, the permission request
// and check handlers, the main window's sandbox, and the IPC check against a foreign page in a window of its own. The
// decisions themselves are unit tested in src/main/security.test.ts.
//
// Quiet like every e2e case (TRANSFER_E2E_QUIET): no window shown, nothing on the LAN. The only other page used is served
// on 127.0.0.1 by this file. The clipboard case writes its own marker and puts the previous text back.
//
// Known gaps: the screenshot overlay is created only by a real capture, which would record the screen, so its sandboxing
// is held by a static case (src/main/security.test.ts) and checked by hand on a real build; a real drop from the desktop
// cannot be made by a test (the page-level guard and the navigation guard are each covered below); the frame-to-sender
// mapping has no subframe to drive it (see src/main/security.test.ts).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { TransferApi } from '../src/preload'

/** A page that is not Transfer's: it records in its title whether it holds the API and what an IPC call gets */
const PROBE = `<!doctype html><title>probe</title><script>
(async () => {
  let ipc = 'no api'
  if (window.transfer) {
    try { await window.transfer.getIdentity(); ipc = 'answered' } catch (e) { ipc = 'refused' }
  }
  document.title = 'probe:' + ipc
})()
</script>`

let dir: string
let app: ElectronApplication
let page: Page
let server: Server
let foreign: string

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'transfer-security-e2e-'))
  writeFileSync(join(dir, 'probe.html'), PROBE)
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(PROBE)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  foreign = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/probe.html`
  app = await electron.launch({
    args: ['.', `--user-data-dir=${join(dir, 'data')}`],
    env: { ...process.env, NODE_ENV: 'production', TRANSFER_E2E_QUIET: '1', TRANSFER_USERDATA: join(dir, 'data') }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
})

/** One more round trip on the same page, so a navigation the previous step started has either landed or been cancelled */
async function settle(): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)))
}

test("a navigation away from Transfer's page is cancelled, and the page keeps working (electron-security::CON-001)", async () => {
  const before = page.url()
  await page.evaluate((url) => {
    location.href = url
  }, foreign)
  await settle()
  expect(page.url()).toBe(before)
  const answered = await page.evaluate(async () => (await (window as unknown as { transfer: TransferApi }).transfer.getIdentity()).fingerprint)
  expect(answered).toMatch(/\S/)
})

test('a new window is denied (electron-security::CON-001)', async () => {
  const count = async (): Promise<number> => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  const before = await count()
  await page.evaluate((url) => void window.open(url), foreign)
  await settle()
  expect(await count()).toBe(before)
})

test('a drop outside any drop target is taken by the page and goes nowhere (electron-security::CON-002)', async () => {
  const before = page.url()
  const prevented = await page.evaluate(() => {
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  await settle()
  expect(page.url()).toBe(before)
})

test('a drop target in the page still receives a drop, which the page guard takes without stopping (electron-security::CON-002)', async () => {
  // As the chat's message list does: its handlers run from React's root listener, in the bubble phase
  const result = await page.evaluate(() => {
    const target = document.createElement('div')
    document.body.append(target)
    let received = false
    target.addEventListener('drop', () => {
      received = true
    })
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })
    target.dispatchEvent(event)
    target.remove()
    return { received, prevented: event.defaultPrevented }
  })
  expect(result).toEqual({ received: true, prevented: true })
})

test('the main window runs sandboxed (electron-security::CON-005)', async () => {
  // getLastWebPreferences is documented but missing from Electron 35's type definitions
  const sandboxed = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map(
      (w) => (w.webContents as unknown as { getLastWebPreferences(): { sandbox?: boolean } | null }).getLastWebPreferences()?.sandbox
    )
  )
  expect(sandboxed.length).toBeGreaterThan(0)
  expect(sandboxed.every((s) => s === true)).toBe(true)
})

test("Transfer's own page may still write to the clipboard (electron-security::CON-004)", async () => {
  const previous = await app.evaluate(({ clipboard }) => clipboard.readText())
  const marker = `transfer-security-e2e-${Date.now()}`
  try {
    await page.evaluate((text) => navigator.clipboard.writeText(text), marker)
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(marker)
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), previous)
  }
})

test('every other permission is refused, even to Transfer\'s own page (electron-security::CON-004)', async () => {
  expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied')
})

test("a permission check from Transfer's own page is denied too (electron-security::CON-004)", async () => {
  expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'notifications' })).state)).toBe('denied')
})

test("a page that is not Transfer's gets no answer from IPC (electron-security::CON-003/AC-02)", async () => {
  // A hidden window of its own, with Transfer's preload, loaded by the main process itself: a programmatic load is not
  // seen by the navigation guard, so this is the only way to put a foreign page next to the API. The shared main window
  // never leaves Transfer's page, and this window is closed at the end.
  const preload = join(process.cwd(), 'out', 'preload', 'index.cjs')
  const title = await app.evaluate(
    async ({ BrowserWindow }, { url, preload }) => {
      const win = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } })
      try {
        await win.loadURL(url)
        for (let i = 0; i < 100 && !win.webContents.getTitle().startsWith('probe:'); i++) await new Promise((r) => setTimeout(r, 50))
        return win.webContents.getTitle()
      } finally {
        win.destroy()
      }
    },
    { url: pathToFileURL(join(dir, 'probe.html')).href, preload }
  )
  expect(title).toBe('probe:refused')
})
