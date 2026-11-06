// e2e: the wiring of the Electron security baseline (docs/specs/electron-security.md, ADR-0025). The decisions are unit
// tested in src/main/security.test.ts; these cases hold that the real windows, frames and sessions reach them.
//
// Quiet like every e2e case (TRANSFER_E2E_QUIET): no window shown, nothing on the LAN. The only other page used is served
// on 127.0.0.1 by this file. The clipboard case writes its own marker and puts the previous text back.
//
// Not covered here: the screenshot overlay is created only by a real capture, which would record the screen, so its
// sandboxing is held by a static case (src/main/security.test.ts) and checked by hand on a real package; and a real drop
// from the desktop, which no test can make (the page-level guard and the navigation guard are each covered below).
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

// Last: it replaces the window's page
test("a page that is not Transfer's gets no answer from IPC (electron-security::CON-003/AC-02)", async () => {
  // A load the main process starts itself, which the navigation guard does not see: the only way to put a foreign page
  // in the window, and so to reach the IPC check from one
  await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows()[0].loadURL(url), pathToFileURL(join(dir, 'probe.html')).href)
  await page.waitForFunction(() => document.title.startsWith('probe:'))
  expect(await page.title()).toBe('probe:refused')
})
