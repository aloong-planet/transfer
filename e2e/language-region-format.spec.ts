// e2e for language::REQ-004/AC-01, language::REQ-004/AC-02 and language::REQ-004/AC-03: the two places that write an
// instant (the time under a chat message, the date and time on a line of the Received Files page) follow the system's
// region format, not the interface language.
//
// The rule that turns a language and a region into a locale is a unit case (src/shared/i18n/region-format.test.ts). What
// this file holds is the wiring it cannot show: what the system reports reaches the window through the main process,
// and each of the two places writes with it. Each pair is launched with a language list and a region that do NOT belong
// together, so a page that took its format from the interface language, or from the machine running the suite, reads
// differently from the expectation:
// - English interface, German region: 24-hour clock, day before month, although the interface is English.
// - Chinese interface, US region: 12-hour clock, month before day, although the interface is Chinese.
// Each language list names both languages, in the order that makes the pair's own the first: the interface follows the
// first entry (language::REQ-002/AC-01), so a seam that passed on the wrong entry would show the other interface.
// Each pair is checked against its interface first (the document's language), so a seam that did not take could not leave
// a matched pair that passes by accident.
//
// The second pair reads as a US machine's own default does, so on such a machine (the usual one, and CI's) it cannot tell a
// wired page from an unwired one; the first pair can, and the second tells a page that follows the interface language.
//
// Every expected text was read from the formatter of the Electron this repository builds with (probe on a stand-in
// window), not computed from the code under test. The instant is a local 21:30, so the clock the reading is on is the one
// thing that differs between the two pairs.
//
// Gaps, with the condition under which each could be closed:
// - The system's own report (`app.getSystemLocale()` on macOS, Windows and Linux) is replaced by the test seam here, so
//   what each real platform reports is not exercised by this file. Closable by running the suite on each platform with
//   the system's region set to a mismatched one; the delivery of this change records what was read on macOS.
// - What is read is the DOM text, not pixels: a quiet instance never shows its window (see ui-icons.spec.ts). Closable by
//   a shown window and a screenshot.
// - The hidden test window takes no real pointer input (see ui-icons.spec.ts), so the Received Files entry is opened with
//   a DOM click event. Closable by a shown window driven with page.mouse, e.g. under xvfb in CI.
//
// One app instance per pair, because the region is read when the window is created.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { MessageStore } from '../src/main/db/messages'
import { DICT } from '../src/shared/i18n/dict'
import type { Lang } from '../src/shared/i18n/t'
import { launchQuiet } from './helpers/quiet-launch'
import { openChatWith } from './helpers/open-chat'

const PEER = 'e2e-region-format-peer'
const ALIAS = 'Region-PC'
/** 2026-11-25 21:30 on the clock of the machine running the suite, which the app under test shares */
const EVENING = new Date(2026, 10, 25, 21, 30).getTime()

interface Pair {
  name: string
  /** What the system reports as its languages, the interface's own first */
  languages: string
  /** What the system reports as its locale: the language and the region it formats in */
  systemLocale: string
  /** The interface language that follows from the language list */
  lang: Lang
  /** The tag the document declares for it */
  documentLang: string
  /** The time of the instant in the region's format */
  time: string
  /** The date and time of the instant in the region's format */
  dateTime: string
}

const PAIRS: readonly Pair[] = [
  {
    name: 'English interface, German region',
    languages: 'en-US,zh-Hans-CN',
    systemLocale: 'en-DE',
    lang: 'en',
    documentLang: 'en',
    time: '21:30',
    dateTime: '25/11, 21:30'
  },
  {
    name: 'Chinese interface, US region',
    languages: 'zh-Hans-CN,en-US',
    systemLocale: 'zh-Hans-US',
    lang: 'zh',
    documentLang: 'zh-Hans',
    time: '09:30 PM',
    dateTime: '11/25, 09:30 PM'
  }
]

for (const pair of PAIRS) {
  test.describe.serial(pair.name, () => {
    let app: ElectronApplication
    let page: Page
    let userData: string

    test.beforeAll(async () => {
      userData = mkdtempSync(join(tmpdir(), 'transfer-region-format-e2e-'))
      const store = new MessageStore(join(userData, 'messages.db'))
      const base = {
        direction: 'recv',
        peerFp: PEER,
        peerAlias: ALIAS,
        status: 'done',
        errorReason: null,
        transferId: null,
        createdAt: EVENING
      } as const
      store.insert({
        ...base,
        id: 'e2e-region-format-text',
        type: 'text',
        content: 'a message at half past nine in the evening',
        fileName: null,
        fileSize: null,
        filePath: null
      })
      store.insert({
        ...base,
        id: 'e2e-region-format-file',
        type: 'file',
        content: null,
        fileName: 'evening.txt',
        fileSize: 1,
        filePath: join(userData, 'received', 'evening.txt')
      })
      store.close()

      ;({ app, page } = await launchQuiet(userData, {
        env: { TRANSFER_SYSTEM_LANGUAGES: pair.languages, TRANSFER_SYSTEM_LOCALE: pair.systemLocale }
      }))
      // The interface really is the one the pair names, so the region is the only thing the clock can follow
      await expect(page.locator('html')).toHaveAttribute('lang', pair.documentLang)
    })

    test.afterAll(async () => {
      await app?.close()
      rmSync(userData, { recursive: true, force: true })
    })

    test('the time under a chat message is written in the system region format', async () => {
      await openChatWith(app, page, { fingerprint: PEER, alias: ALIAS })

      // Both seeded messages, the text and the file, carry the time of the same instant
      await expect(page.getByTestId('message-time')).toHaveText([pair.time, pair.time])
    })

    test('the date and time on a received file are written in the system region format', async () => {
      // The sidebar entry is the row that carries the page's name in the interface language of the pair
      await page.locator('.tf-row').filter({ hasText: DICT[pair.lang]['sidebar.received'] }).dispatchEvent('click')

      await expect(page.getByTestId('received-file-time')).toHaveText(pair.dateTime)
    })
  })
}
