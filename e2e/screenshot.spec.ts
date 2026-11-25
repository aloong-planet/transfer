// e2e: the Shortcut section of Settings (spec screenshot, screenshot::REQ-001/AC-05).
//
// Guards the one wiring only the renderer shows: the saved combination was refused at startup, and Settings says so from
// the moment it opens, in both interface languages, until a combination that registers is set. The decision of when the
// refusal is recorded is tested at the service (src/main/screenshot-service.test.ts).
//
// Why the state is supplied here and not produced: a test instance never registers the global shortcut at startup (see
// QUIET in src/main/index.ts), so a refusal at startup cannot happen in this suite, and neither can a real conflict with
// another application. The only other way to produce one is a new launch input, which ADR-0024 keeps out of the packaged
// build. So the main process's answer to `settings:getShortcut` is replaced, and the renderer is what is under test.
// Known gap: the real handler's answer with the conflict set is not exercised end to end; its answer without one is
// (the second case).
//
// The main process is touched only after `firstWindow()`. `electron.launch` can return before the app's
// `app.whenReady()` handler has run, so an `app.evaluate` made right after it can land first. A handler registered then
// for a channel the app registers itself makes `registerIpc()` throw on the duplicate: the ready handler stops before
// `createWindow()`, no window ever opens, and the case fails with a `firstWindow` timeout. The first window exists only
// once `registerIpc()` has run (src/main/index.ts), and Settings asks for the answer only when it opens, so replacing
// the handler between the two keeps each case's meaning. `launchQuiet` (helpers/quiet-launch.ts) returns only after
// `firstWindow()` has, so a case replaces a handler right after it.
//
// A quiet instance per case: its own userData, no window shown, no global shortcut, no network (see ui-icons.spec.ts).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchQuiet } from './helpers/quiet-launch'

/** The notice's text in each interface language, as screenshot::REQ-001/AC-04 gives it */
const NOTICE = {
  zh: '该快捷键可能被其他程序占用,请换一个',
  en: 'This shortcut may be taken by another app, try another'
} as const

interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

async function launch(language: 'zh' | 'en'): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'transfer-shortcut-e2e-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language }))
  const { app, page } = await launchQuiet(userData)
  return { app, page, userData }
}

async function close(l: Launched): Promise<void> {
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
}

/**
 * The main process answers that the saved combination (F1) could not be registered at startup. Call it only after
 * `firstWindow()` has returned, as it has when `launch` does (see the header).
 */
async function reportStartupConflict(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    // The channel of CMD.getShortcut (src/shared/ipc.ts)
    ipcMain.removeHandler('settings:getShortcut')
    ipcMain.handle('settings:getShortcut', () => ({ accel: 'F1', conflict: true }))
  })
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('btn-settings').click()
}

for (const language of ['zh', 'en'] as const) {
  test(`a startup refusal is told in Settings from the moment it opens, in ${language}`, async () => {
    const l = await launch(language)
    try {
      const { page } = l
      await reportStartupConflict(l.app)
      await openSettings(page)
      const capture = page.getByRole('button', { name: 'F1', exact: true })
      await expect(capture).toBeVisible()
      await expect(page.getByText(NOTICE[language], { exact: true })).toBeVisible()

      // Choosing a combination shows its own guidance in the notice's place; ending the choosing brings the notice back
      await capture.click()
      await expect(page.getByText(NOTICE[language], { exact: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(capture).toBeVisible()
      await expect(page.getByText(NOTICE[language], { exact: true })).toBeVisible()
    } finally {
      await close(l)
    }
  })
}

test('Settings shows no notice when the saved combination was not refused', async () => {
  // The real handler answers: a quiet instance registers nothing, so nothing was refused
  const l = await launch('zh')
  try {
    const { page } = l
    await openSettings(page)
    await expect(page.getByRole('button', { name: 'F1', exact: true })).toBeVisible()
    await expect(page.getByText(NOTICE.zh, { exact: true })).toHaveCount(0)
  } finally {
    await close(l)
  }
})

test('setting a combination that registers removes the notice', async () => {
  const l = await launch('zh')
  try {
    const { page } = l
    await reportStartupConflict(l.app)
    // Electron's registration is replaced at its boundary: the real one would claim the combination system-wide
    // from a test instance. The change itself goes through the real handler and the real service.
    await l.app.evaluate(({ globalShortcut }) => {
      globalShortcut.register = () => true
      globalShortcut.unregister = () => {}
    })
    await openSettings(page)
    await expect(page.getByText(NOTICE.zh, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'F1', exact: true }).click()
    await page.keyboard.press('Control+Shift+K')
    await expect(page.getByRole('button', { name: 'Control+Shift+K', exact: true })).toBeVisible()
    await expect(page.getByText(NOTICE.zh, { exact: true })).toHaveCount(0)
  } finally {
    await close(l)
  }
})
