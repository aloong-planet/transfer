// e2e: a text over 32 KiB goes out as a .txt file (spec transfer-chat, section E).
//
// This guards the one wiring only the real main process shows: where the file is written (the
// `sent-texts` folder under userData) and that its name prefix is read from the interface
// language at send time. The rest of the feature is covered without Electron (chat-service and
// app-core.e2e unit tests).
//
// No second device is needed: the recipient is a fingerprint nobody has, so the send fails as
// offline. By then the file has been written and the sent file message points at it, which is
// all this test looks at.
//
// Runs without disturbing the user: each case has its own userData, and TRANSFER_E2E_QUIET is set
// (see ui-icons.spec.ts).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

interface SentMessage {
  type: string
  direction: string
  fileName: string | null
  filePath: string | null
  status: string
  errorReason: string | null
}

type TransferApi = {
  sendText: (args: { peerFp: string; text: string }) => Promise<void>
  listMessages: () => Promise<SentMessage[]>
}

for (const { language, prefix } of [
  { language: 'zh', prefix: '文本' },
  { language: 'en', prefix: 'text' }
]) {
  test(`a text over 32 KiB is written to sent-texts as ${prefix}_….txt (language ${language})`, async () => {
    const userData = mkdtempSync(join(tmpdir(), 'transfer-longtext-e2e-'))
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language }))
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userData}`],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TRANSFER_E2E_QUIET: '1',
        TRANSFER_USERDATA: userData
      }
    })
    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')

      const text = '€'.repeat(12000) // 36000 bytes in 12000 characters
      const messages = await page.evaluate(async (t) => {
        const api = (window as unknown as { transfer: TransferApi }).transfer
        await api.sendText({ peerFp: 'NOBODY', text: t })
        return api.listMessages()
      }, text)

      const sent = messages.find((m) => m.direction === 'sent')
      expect(sent).toMatchObject({ type: 'file', status: 'failed', errorReason: 'offline' })
      expect(sent!.fileName).toMatch(new RegExp(`^${prefix}_\\d+_[0-9a-f]{8}\\.txt$`))
      // userData may be reported through a symlink (macOS /var → /private/var), so compare
      // the unique folder name rather than the whole path
      expect(basename(dirname(sent!.filePath!))).toBe('sent-texts')
      expect(sent!.filePath).toContain(basename(userData))
      expect(readFileSync(sent!.filePath!, 'utf8')).toBe(text)
    } finally {
      await app.close()
      rmSync(userData, { recursive: true, force: true })
    }
  })
}
