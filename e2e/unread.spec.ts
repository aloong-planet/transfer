// e2e: unread counts in the running window — a device row's badge counts the messages from that device, the
// total goes to the main process, and the count goes to zero when the window showing that chat gains focus
// (unread::REQ-001/AC-01, unread::REQ-002/AC-01, unread::REQ-002/AC-02, unread::REQ-003/AC-01).
//
// Which messages count, and how counts add up, are unit cases in src/shared/unread.test.ts. This file holds
// the wiring they cannot show: the window's message events reach the count by sender, the row reads its own
// device's count, and the total reaches the main process's badge call.
//
// How messages arrive: quiet instances run no discovery, so the device comes from the device-list update
// that open-chat.ts sends, and incoming messages are the message events the main process sends the window.
// Focus is the window-focus event the main process sends on focus and blur.
//
// Gaps, with the condition under which each could be closed:
// - The Dock badge itself is not read: the main process's call to app.setBadgeCount is recorded instead, as
//   the badge exists only on macOS. Closable by a macOS run that reads app.getBadgeCount().
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { EVT } from '../src/shared/ipc'
import type { Message } from '../src/shared/message'
import { openChatWith } from './helpers/open-chat'

const LISTED = { fingerprint: 'constructor', alias: 'Odd-PC' }
const UNLISTED = 'AB:CD:EF:01:23:45:67:89'

let app: ElectronApplication
let page: Page
let userData: string

/** Sends the window what the main process sends it */
function sendToWindow(channel: string, payload: unknown): Promise<void> {
  return app.evaluate(
    ({ BrowserWindow }, [ch, p]) => {
      const main = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('overlay'))!
      main.webContents.send(ch, p)
    },
    [channel, payload] as const
  )
}

/** An incoming text from `peerFp`, as the main process sends it when it first stores it */
function incoming(id: string, peerFp: string): Message {
  return {
    id,
    type: 'text',
    direction: 'recv',
    peerFp,
    peerAlias: 'Sender',
    content: id,
    fileName: null,
    fileSize: null,
    filePath: null,
    status: 'done',
    errorReason: null,
    transferId: null,
    createdAt: Date.now(),
    durationMs: null
  }
}

/** The last count the main process passed to app.setBadgeCount */
const lastBadgeCount = (): Promise<number | undefined> =>
  app.evaluate(() => (globalThis as { __e2eBadgeCount?: number }).__e2eBadgeCount)

/** The badge at the right end of a device's row */
const badgeOf = (alias: string): ReturnType<Page['locator']> =>
  page.locator('.tf-row').filter({ hasText: alias }).locator(':scope > div > span')

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'transfer-unread-e2e-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language: 'zh' }))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'production', TRANSFER_E2E_QUIET: '1', TRANSFER_USERDATA: userData }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Records the count instead of setting the operating system's badge
  await app.evaluate(({ app: electronApp }) => {
    electronApp.setBadgeCount = (count?: number): boolean => {
      ;(globalThis as { __e2eBadgeCount?: number }).__e2eBadgeCount = count
      return true
    }
  })
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test("a device's row counts its own unread messages, the total reaches the main process, and focus on its open chat clears it", async () => {
  await openChatWith(app, page, LISTED)
  await sendToWindow(EVT.windowFocus, false)

  await sendToWindow(EVT.messageUpserted, incoming('e2e-unread-1', LISTED.fingerprint))
  await sendToWindow(EVT.messageUpserted, incoming('e2e-unread-2', UNLISTED))
  await sendToWindow(EVT.messageUpserted, incoming('e2e-unread-3', LISTED.fingerprint))

  await expect(badgeOf(LISTED.alias)).toHaveText('2')
  await expect.poll(lastBadgeCount).toBe(3)

  // The window already showing that chat gains focus: its count goes to zero, the other sender's stays
  await sendToWindow(EVT.windowFocus, true)
  await expect(badgeOf(LISTED.alias)).toHaveCount(0)
  await expect.poll(lastBadgeCount).toBe(1)
})
