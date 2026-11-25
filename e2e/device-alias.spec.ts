// e2e: committing the alias input of a device. The first two cases are device-alias::REQ-001/AC-04 (by Enter,
// by clicking elsewhere); the third is device-alias::REQ-001/AC-02.
//
// How a device gets into the list: quiet instances run no discovery (they would announce on the LAN), so
// the test sends the renderer a device-list update, the channel discovery uses in the product (the same
// way image-copy.spec.ts does). The device is not in the main process's registry.
//
// Gaps, with the condition under which each could be closed:
// - What a save shows (the alias in the device list and in the chat's title bar,
//   device-alias::REQ-002/AC-01) is not asserted: after a save the main process pushes its own merged
//   list, which is empty here because the injected device is not in its registry. The saved alias is read
//   from settings.json instead. Closable by a way to put a device into the registry without announcing.
// - That the device's menu still offers no 清除备注 after an unchanged commit is not asserted: the menu
//   takes whether the device has an alias from the device list the test injects, so no change to the code
//   under test could turn that assertion red. Closable by the same registry seam.
// - The hidden test window takes no real pointer or key input (see ui-icons.spec.ts), so the right-click,
//   the menu click, Enter and "clicking elsewhere" are dispatched as DOM events: Enter as a keydown on the
//   input, "clicking elsewhere" as the input losing focus. Closable by a shown window driven with
//   page.mouse and page.keyboard, e.g. under xvfb in CI.
// - A device that already has an alias, committed unchanged, is not a case of its own: the input opens
//   with the same text and takes the same path, and rewriting the alias with itself would not show in
//   settings.json either.
//
// One app instance for the whole file; every case shows its own device, which replaces the list.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { EVT } from '../src/shared/ipc'
import type { RemoteDevice } from '../src/shared/types'

let app: ElectronApplication
let page: Page
let userData: string

/** The aliases settings.json holds, by fingerprint */
function aliasesOnDisk(): Record<string, string> {
  try {
    const s = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
      deviceAliases?: Record<string, string>
    }
    return s.deviceAliases ?? {}
  } catch {
    return {}
  }
}

/**
 * Stands in for discovery: one online device without an alias. Sent until its row shows, because a single
 * update sent during start-up was seen to be lost (image-copy.spec.ts, 2026-10-22).
 */
async function showDevice(fingerprint: string, name: string): Promise<void> {
  const device: RemoteDevice = {
    info: { alias: name, version: '2.1', fingerprint, deviceType: 'desktop', hasCustomAlias: false },
    address: '127.0.0.1',
    port: 53399,
    protocol: 'https',
    lastSeen: Date.now(),
    status: 'online'
  }
  const row = page.getByText(name, { exact: true }).first()
  await expect(async () => {
    await app.evaluate(
      ({ BrowserWindow }, [channel, d]) => {
        const main = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('overlay'))!
        main.webContents.send(channel, [d])
      },
      [EVT.devicesUpdated, device] as const
    )
    await expect(row).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 15_000 })
}

/** The device's row in the list */
const rowOf = (name: string): ReturnType<Page['locator']> => page.locator('.tf-row').filter({ hasText: name })

/** Right-clicks the device's row where a pointer would be, then chooses 修改备注 and returns the input */
async function openEditor(name: string): Promise<ReturnType<Page['locator']>> {
  const row = rowOf(name)
  await expect(row).toBeVisible()
  const box = (await row.boundingBox())!
  // Built in the page: Playwright's dispatchEvent('contextmenu') carries no pointer position
  // (docs/postmortems/playwright-contextmenu-no-coordinates.md). The menu's place does not matter here.
  await row.evaluate(
    (el, p) =>
      el.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: p.x, clientY: p.y })
      ),
    { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  )
  await page.getByText('修改备注', { exact: true }).dispatchEvent('click')
  const input = page.locator('.tf-row input')
  await expect(input, 'the editor opens with the name the row showed').toHaveValue(name)
  return input
}

async function pressEnter(input: ReturnType<Page['locator']>): Promise<void> {
  await input.evaluate((el) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  )
}

async function clickElsewhere(input: ReturnType<Page['locator']>): Promise<void> {
  await input.evaluate((el) => (el as HTMLElement).blur())
}

test.describe.serial('device alias input', () => {
  test.beforeAll(async () => {
    userData = mkdtempSync(join(tmpdir(), 'transfer-alias-e2e-'))
    // zh, so the menu labels asserted below are the dictionary's Chinese ones
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language: 'zh' }))
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

  test('Enter on an unchanged input closes it and stores no alias', async () => {
    const fp = 'e2e-alias-enter'
    await showDevice(fp, 'Enter-PC')
    const input = await openEditor('Enter-PC')
    await pressEnter(input)
    await expect(input).toHaveCount(0)
    expect(aliasesOnDisk()).not.toHaveProperty(fp)
  })

  test('clicking elsewhere on an unchanged input closes it and stores no alias', async () => {
    const fp = 'e2e-alias-blur'
    await showDevice(fp, 'Blur-PC')
    const input = await openEditor('Blur-PC')
    await clickElsewhere(input)
    await expect(input).toHaveCount(0)
    expect(aliasesOnDisk()).not.toHaveProperty(fp)
  })

  test('a changed input is stored as the alias', async () => {
    const fp = 'e2e-alias-changed'
    await showDevice(fp, 'Changed-PC')
    const input = await openEditor('Changed-PC')
    await input.fill('老张的电脑')
    await pressEnter(input)
    await expect.poll(() => aliasesOnDisk()[fp]).toBe('老张的电脑')
  })
})
