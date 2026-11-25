// e2e: a text over 32 KiB sent as a .txt file (spec transfer-chat, section E, and
// transfer-chat::REQ-006/AC-03). The rest of this feature runs without Electron (chat-service,
// text-file, app-core.e2e); what only the real main process and window show is checked here.
//
// Runs without disturbing the user: each case has its own userData, and TRANSFER_E2E_QUIET is set
// (see ui-icons.spec.ts).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { MessageStore } from '../src/main/db/messages'
import { openChatWith } from './helpers/open-chat'
import { launchQuiet } from './helpers/quiet-launch'

interface SentMessage {
  id: string
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
  setLanguage: (language: string) => Promise<void>
  canShowUnfinishedTextFile: (messageId: string) => Promise<boolean>
}

// The file is written, and named, when the text is sent: no second device is needed. The recipient
// is a fingerprint nobody has, so the send fails as offline; by then the file exists and the sent
// file message points at it, which is all this case looks at.
test('a text over 32 KiB is written to sent-texts, named in the interface language of the moment it is sent', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'transfer-longtext-e2e-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language: 'zh' }))
  const { app, page } = await launchQuiet(userData)
  try {
    const text = '€'.repeat(12000) // 36000 bytes in 12000 characters
    const sendLongText = (): Promise<SentMessage> =>
      page.evaluate(async (t) => {
        const api = (window as unknown as { transfer: TransferApi }).transfer
        const known = new Set((await api.listMessages()).map((m) => m.id))
        await api.sendText({ peerFp: 'NOBODY', text: t })
        return (await api.listMessages()).find((m) => !known.has(m.id))!
      }, text)
    const expectWrittenAs = (sent: SentMessage, prefix: string): void => {
      expect(sent).toMatchObject({ type: 'file', status: 'failed', errorReason: 'offline' })
      expect(sent.fileName).toMatch(new RegExp(`^${prefix}_\\d+_[0-9a-f]{8}\\.txt$`))
      // userData may be reported through a symlink (macOS /var → /private/var), so compare
      // the unique folder name rather than the whole path
      expect(basename(dirname(sent.filePath!))).toBe('sent-texts')
      expect(sent.filePath).toContain(basename(userData))
      expect(readFileSync(sent.filePath!, 'utf8')).toBe(text)
    }

    expectWrittenAs(await sendLongText(), '文本')
    // The prefix follows the language at the moment of sending: switched in the same running app
    await page.evaluate(() => (window as unknown as { transfer: TransferApi }).transfer.setLanguage('en'))
    expectWrittenAs(await sendLongText(), 'text')
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

// The chat is opened over seeded messages (see helpers/open-chat.ts). The one delivered text file is
// the control that the button can be found in this setup at all.
test('a text sent as a file that did not arrive can be shown in its folder while its file is there', async () => {
  const PEER = 'e2e-text-peer-fingerprint'
  const ALIAS = 'E2E Text Peer'
  const BUTTON = '打开所在文件夹'
  const userData = mkdtempSync(join(tmpdir(), 'transfer-textfolder-e2e-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language: 'zh' }))
  const sentTexts = join(userData, 'sent-texts')
  const elsewhere = join(userData, 'elsewhere')
  mkdirSync(sentTexts)
  mkdirSync(elsewhere)

  // [file name, folder, status, does the file exist]
  const seed: Array<[string, string, 'done' | 'failed' | 'rejected' | 'expired', boolean]> = [
    ['text_1_00000001.txt', sentTexts, 'done', true],
    ['text_2_00000002.txt', sentTexts, 'failed', true],
    ['text_3_00000003.txt', sentTexts, 'rejected', true],
    ['text_4_00000004.txt', sentTexts, 'expired', true],
    ['text_5_00000005.txt', sentTexts, 'failed', false],
    ['report.txt', elsewhere, 'failed', true]
  ]
  const store = new MessageStore(join(userData, 'messages.db'))
  seed.forEach(([name, dir, status, exists], i) => {
    if (exists) writeFileSync(join(dir, name), 'the text')
    store.insert({
      id: `e2e-text-${name}`,
      type: 'file',
      direction: 'sent',
      peerFp: PEER,
      peerAlias: ALIAS,
      content: null,
      fileName: name,
      fileSize: 8,
      filePath: join(dir, name),
      status,
      errorReason: status === 'failed' ? 'offline' : null,
      transferId: null,
      createdAt: 1_760_000_000_000 + i * 1000
    })
  })
  store.close()

  const { app, page } = await launchQuiet(userData)
  try {
    await openChatWith(app, page, { fingerprint: PEER, alias: ALIAS })
    const bubble = (name: string): ReturnType<Page['getByTestId']> =>
      page.getByTestId('file-bubble').filter({ hasText: name })
    const button = (name: string): ReturnType<Page['getByRole']> => bubble(name).getByRole('button', { name: BUTTON })

    // delivered (the ordinary rule), then the three ways a long text ends without arriving
    for (const name of ['text_1_00000001.txt', 'text_2_00000002.txt', 'text_3_00000003.txt', 'text_4_00000004.txt']) {
      await expect(button(name), name).toBeVisible()
    }
    // main has answered every bubble by now, and the page has had two frames to show the answers
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    for (const name of ['text_5_00000005.txt', 'report.txt']) {
      await expect(bubble(name), name).toBeVisible()
      await expect(button(name), name).toHaveCount(0)
    }
    // and main itself says so for the two without the button
    for (const name of ['text_5_00000005.txt', 'report.txt']) {
      const answer = await page.evaluate(
        (id) => (window as unknown as { transfer: TransferApi }).transfer.canShowUnfinishedTextFile(id),
        `e2e-text-${name}`
      )
      expect(answer, name).toBe(false)
    }
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
