// e2e: the 已接收文件 / Received Files page names each file's sender by the sender's alias, and follows a
// change of alias without being reopened (device-alias::REQ-002/AC-02, device-alias::REQ-002/AC-03).
//
// Which name wins, and that an alias outlives the device list (device-alias::REQ-003/AC-02), are unit cases
// in src/main/app-core.alias.test.ts. This file holds the wiring they cannot show: the page's list comes
// through the main process's merge of aliases, and the page reloads when an alias is saved or cleared.
//
// How a sender gets onto the page: quiet instances run no discovery (they would announce on the LAN), so the
// test seeds the message store with received files from two made-up peers before the app starts, the way
// image-copy.spec.ts seeds its chat. Neither peer is in any device list, which is also the state of a device
// dropped from the list. An alias is saved and cleared through the preload API, the channel the device row's
// menu uses; driving that menu is device-alias.spec.ts's job.
//
// Gaps, with the condition under which each could be closed:
// - The hidden test window takes no real pointer input (see ui-icons.spec.ts), so the sidebar entry is
//   opened with a DOM click event. Closable by a shown window driven with page.mouse, e.g. under xvfb in CI.
// - Setting an alias from the device row's menu while this page is open is not driven: the row takes its
//   device from the device list the test would have to inject, which the main process's own push then
//   replaces (see device-alias.spec.ts). Closable by a way to put a device into the registry without
//   announcing.
//
// One app instance for the whole file.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { MessageStore } from '../src/main/db/messages'
import type { TransferApi } from '../src/preload'

const SENDER_X = 'e2e-recv-alias-x'
const SENDER_Y = 'e2e-recv-alias-y'

let app: ElectronApplication
let page: Page
let userData: string

/** Saves (or, with '', clears) the alias of a device, as the device row's menu does */
function setAlias(fingerprint: string, alias: string): Promise<{ ok: boolean }> {
  return page.evaluate(
    ([fp, name]) => (window as unknown as { transfer: TransferApi }).transfer.setRemoteAlias(fp, name),
    [fingerprint, alias] as const
  )
}

/** The page's line for a received file */
const lineOf = (fileName: string): ReturnType<Page['locator']> =>
  page.locator('.tf-row').filter({ hasText: fileName })

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'transfer-recv-alias-e2e-'))
  // zh, so the copy asserted below is the dictionary's Chinese one
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language: 'zh' }))

  const store = new MessageStore(join(userData, 'messages.db'))
  const seed = [
    { id: 'e2e-recv-alias-0', fp: SENDER_X, storedName: 'Stored-PC', fileName: 'from-x.txt' },
    { id: 'e2e-recv-alias-1', fp: SENDER_Y, storedName: 'Other-PC', fileName: 'from-y.txt' }
  ]
  seed.forEach(({ id, fp, storedName, fileName }, i) => {
    store.insert({
      id,
      type: 'file',
      direction: 'recv',
      peerFp: fp,
      peerAlias: storedName,
      content: null,
      fileName,
      fileSize: 1,
      filePath: join(userData, 'received', fileName),
      status: 'done',
      errorReason: null,
      transferId: null,
      createdAt: 1_760_000_000_000 + i * 1000
    })
  })
  store.close()

  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'production', TRANSFER_E2E_QUIET: '1', TRANSFER_USERDATA: userData }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('the Received Files page names a sender by its alias and follows a change without being reopened', async () => {
  // The main process answers an empty list until it has started, and the page asks once when it opens, so
  // the page is opened only after the main process has answered with both seeded files
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { transfer: TransferApi }).transfer.listReceivedFiles().then((l) => l.length)
      )
    )
    .toBe(2)
  await page.locator('.tf-row').filter({ hasText: '已接收文件' }).dispatchEvent('click')

  // No alias yet: the name stored with the message
  await expect(lineOf('from-x.txt')).toContainText('来自 Stored-PC')
  await expect(lineOf('from-y.txt')).toContainText('来自 Other-PC')

  // An alias is saved while the page is open: the line changes, and another device's line does not
  expect(await setAlias(SENDER_X, '老张的电脑')).toEqual({ ok: true })
  await expect(lineOf('from-x.txt')).toContainText('来自 老张的电脑')
  await expect(lineOf('from-x.txt')).not.toContainText('Stored-PC')
  await expect(lineOf('from-y.txt')).toContainText('来自 Other-PC')

  // The alias is cleared: the stored name again
  expect(await setAlias(SENDER_X, '')).toEqual({ ok: true })
  await expect(lineOf('from-x.txt')).toContainText('来自 Stored-PC')
})
