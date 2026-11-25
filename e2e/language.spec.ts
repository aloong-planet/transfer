// e2e for language::REQ-003/AC-02 and language::REQ-003/AC-03.
//
// How a first frame is observed: once mounted, the page asks the main process for the language in force, and the answer
// used to be the only thing that corrected a Chinese placeholder. hold-language.cjs keeps that question unanswered from
// the launch itself, so the page stays in the state it first rendered in and is read there. A window loaded again
// (View > Reload) is held the same way. The same hold applies to the capture overlay's page, which asks the same question.
//
// Gaps, with the condition under which each could be closed:
// - What is read is the DOM of the first render, not its pixels: a quiet instance never shows its window (see
//   ui-icons.spec.ts). Closable by a shown window and a screenshot taken before the question is answered.
// - The capture overlay is created only by a real capture, which would record the screen, so its cases load its page in
//   a hidden window of their own, with the app's preload, as electron-security.spec.ts does. The service's own creation
//   of the window is not exercised. Closable by a way to start a capture without recording.
// - The start-up placeholder the main window shows before its page has mounted is not read: it carries the page's static
//   default tag and shows only the product name. Closable by reading the attribute at the first paint of a shown window.
// - The follow-the-system case cannot tell a wired app from an unwired one on a machine whose first system language is
//   Chinese: the placeholder is Chinese too. There is no seam for the system's languages (the main process reads no
//   launch input but TRANSFER_*, ADR-0024), and the explicit-preference cases do not depend on the machine. Closable by
//   such a seam, or by running this file on an English system.
//
// Each case launches its own app: the language preference is the input under test and is read once, at launch.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { DICT } from '../src/shared/i18n/dict'
import { withLang } from '../src/shared/i18n/lang-query'
import type { Lang } from '../src/shared/i18n/t'
import type { LangPref } from '../src/shared/i18n/resolve'
import type { TransferApi } from '../src/preload'
import { launchQuiet } from './helpers/quiet-launch'

interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

/** Launches a quiet instance whose language lookup is held, with the preference on disk when one is given */
async function launch(language?: LangPref): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'transfer-language-e2e-'))
  if (language) writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language }))
  const { app, page } = await launchQuiet(userData, { electronArgs: ['-r', resolve('e2e/hold-language.cjs')] })
  return { app, page, userData }
}

async function close(l: Launched): Promise<void> {
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
}

/** Lets the held language lookup answer */
async function release(l: Launched): Promise<void> {
  await l.app.evaluate(() => (globalThis as unknown as { releaseLanguageLookup: () => void }).releaseLanguageLookup())
}

/** Loads the window again, as View > Reload does */
async function reload(l: Launched): Promise<void> {
  const loaded = l.page.waitForEvent('domcontentloaded')
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.reload())
  await loaded
}

/**
 * What the main window shows in the state it first rendered in: `emptyText` is the empty chat area's line, `bodyText`
 * everything the window shows. Checks first that the lookup really is unanswered.
 */
async function firstFrame(l: Launched): Promise<{ emptyText: string; bodyText: string }> {
  const empty = l.page.getByTestId('chat-empty')
  await empty.waitFor()
  const held = await l.page.evaluate(() =>
    Promise.race([
      (window as unknown as { transfer: TransferApi }).transfer.getLanguage().then(() => 'answered'),
      new Promise((resolve) => setTimeout(() => resolve('held'), 500))
    ])
  )
  expect(held, 'the language lookup must stay unanswered for the first render to be the one read').toBe('held')
  return { emptyText: (await empty.innerText()).trim(), bodyText: await l.page.locator('body').innerText() }
}

/** Every line of the Chinese dictionary that the English one words differently: none may show in an English window */
function chineseOnlyTexts(): string[] {
  const keys = Object.keys(DICT.zh) as Array<keyof typeof DICT.zh>
  return keys
    .map((k) => ({ zh: DICT.zh[k], en: DICT.en[k] }))
    .filter(({ zh, en }) => zh !== en && /[一-鿿]/.test(zh) && !zh.includes('{'))
    .map(({ zh }) => zh)
}

function expectInLanguage(frame: { emptyText: string; bodyText: string }, lang: Lang): void {
  expect(DICT.zh['chat.emptySearching'], 'the two languages must word the line differently to tell them apart').not.toBe(
    DICT.en['chat.emptySearching']
  )
  expect(frame.emptyText).toBe(DICT[lang]['chat.emptySearching'])
  expect(frame.bodyText).toContain(DICT[lang]['sidebar.received'])
  if (lang === 'en') {
    const chinese = chineseOnlyTexts()
    expect(chinese.length).toBeGreaterThan(0)
    for (const text of chinese) expect(frame.bodyText).not.toContain(text)
  }
}

test('the first frame is in English when the preference is English', async () => {
  const l = await launch('en')
  try {
    expectInLanguage(await firstFrame(l), 'en')
  } finally {
    await close(l)
  }
})

test('the first frame is in Chinese when the preference is Chinese', async () => {
  const l = await launch('zh')
  try {
    expectInLanguage(await firstFrame(l), 'zh')
  } finally {
    await close(l)
  }
})

test('the first frame is in the system language when the preference follows the system', async () => {
  const l = await launch() // no settings.json (language::REQ-001/AC-03)
  try {
    const first = await firstFrame(l)
    await release(l)
    const settled = await l.page.evaluate(() => (window as unknown as { transfer: TransferApi }).transfer.getLanguage())
    expect(settled.pref).toBe('system')
    // language::REQ-002/AC-01 decides which language that is; the first frame must be the one the app settles on
    expectInLanguage(first, settled.effective)
  } finally {
    await close(l)
  }
})

test('a window loaded again after a language change draws its first frame in the new language', async () => {
  const l = await launch('zh')
  try {
    await l.page.evaluate(
      (lang) => (window as unknown as { transfer: TransferApi }).transfer.setLanguage(lang),
      'en' as const
    )
    await expect(l.page.getByTestId('chat-empty')).toHaveText(DICT.en['chat.emptySearching'])
    await reload(l)
    expectInLanguage(await firstFrame(l), 'en')
  } finally {
    await close(l)
  }
})

/** The language the page declares on its `<html>` element */
function declaredLang(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.lang)
}

test('the main window declares the language in force from its first frame', async () => {
  const l = await launch('en')
  try {
    await firstFrame(l)
    expect(await declaredLang(l.page)).toBe('en')
  } finally {
    await close(l)
  }
})

test('the main window declares a language changed in Settings, without being reopened', async () => {
  const l = await launch('zh')
  try {
    await firstFrame(l)
    expect(await declaredLang(l.page)).toBe('zh-Hans')
    // A mark on the window itself: loading the page again would drop it
    await l.page.evaluate(() => ((window as unknown as { sameWindow: boolean }).sameWindow = true))
    await l.page.getByTestId('btn-settings').click()
    const selector = l.page.locator('select', { has: l.page.locator('option[value="system"]') })
    await selector.selectOption('en')
    await expect.poll(() => declaredLang(l.page)).toBe('en')
    await selector.selectOption('zh')
    await expect.poll(() => declaredLang(l.page)).toBe('zh-Hans')
    expect(await l.page.evaluate(() => (window as unknown as { sameWindow?: boolean }).sameWindow)).toBe(true)
  } finally {
    await close(l)
  }
})

test("the capture overlay's page declares the language in force from its first frame and follows a change", async () => {
  const l = await launch('en')
  const overlay = async <T>(script: string): Promise<T> =>
    l.app.evaluate(({ BrowserWindow }, script) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay.html'))!
      return win.webContents.executeJavaScript(script)
    }, script)
  try {
    // The overlay's page as the screenshot service loads it: its URL names the language in force at its creation
    const url = withLang('app://bundle/overlay.html', 'en')
    const preload = join(process.cwd(), 'out', 'preload', 'index.cjs')
    await l.app.evaluate(
      ({ BrowserWindow }, { url, preload }) => {
        const win = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } })
        return win.loadURL(url)
      },
      { url, preload }
    )
    try {
      await expect
        .poll(() => overlay<number>(`document.getElementById('overlay-root')?.childElementCount ?? 0`))
        .toBeGreaterThan(0)
      const held = await overlay<string>(`Promise.race([
        window.transfer.getLanguage().then(() => 'answered'),
        new Promise((resolve) => setTimeout(() => resolve('held'), 500))
      ])`)
      expect(held, 'the language lookup must stay unanswered for the first render to be the one read').toBe('held')
      expect(await overlay<string>('document.documentElement.lang')).toBe('en')

      const setLanguage = (lang: LangPref): Promise<unknown> =>
        l.page.evaluate((lang) => (window as unknown as { transfer: TransferApi }).transfer.setLanguage(lang), lang)
      await setLanguage('zh')
      await expect.poll(() => overlay<string>('document.documentElement.lang')).toBe('zh-Hans')
      await setLanguage('en')
      await expect.poll(() => overlay<string>('document.documentElement.lang')).toBe('en')
    } finally {
      await l.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('overlay.html'))
          ?.destroy()
      })
    }
  } finally {
    await close(l)
  }
})
