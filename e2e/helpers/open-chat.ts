// Shared by the end-to-end specs that need a chat open without a real peer.
//
// Quiet instances run no discovery (they would announce on the LAN), so a spec seeds the message
// store with messages from one made-up peer, then calls this to stand in for discovery: it sends the
// renderer a device-list update naming that peer — the channel discovery uses in the product — and
// opens the chat. The device only opens the chat; nothing talks to it.
import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { EVT } from '../../src/shared/ipc'

export async function openChatWith(
  app: ElectronApplication,
  page: Page,
  peer: { fingerprint: string; alias: string }
): Promise<void> {
  const device = {
    info: {
      alias: peer.alias,
      version: '2.1',
      fingerprint: peer.fingerprint,
      deviceType: 'desktop',
      hasCustomAlias: false
    },
    address: '127.0.0.1',
    port: 53399,
    protocol: 'https',
    lastSeen: Date.now(),
    status: 'online'
  }
  // Sent until the row shows, because a single update sent during start-up was seen to be lost
  // (2026-10-22) — likely sent before the renderer subscribed, or replaced by the renderer's own
  // first, empty device fetch.
  const row = page.getByText(peer.alias, { exact: true }).first()
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
  await row.dispatchEvent('click')
}
