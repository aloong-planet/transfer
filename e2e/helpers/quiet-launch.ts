// The one way an e2e spec starts Transfer.
//
// Every instance is quiet and keeps its data in a directory of its own, so a run of the suite never disturbs the person
// running it:
// - `TRANSFER_E2E_QUIET=1`: no window shown, no global shortcut, nothing on the LAN (QUIET in src/main/index.ts).
// - The data directory is passed twice because two readers need it: `--user-data-dir` is Chromium's, `TRANSFER_USERDATA`
//   is the main process's, which sets `userData` itself. With only the first, a main process that takes its own `setPath`
//   branch still lands in the real folder.
// - `NODE_ENV=production`, as the specs have always passed it.
//
// The data directory is an argument without a default. A copy of this block that forgot it ran the spec against the real
// data folder of whoever ran the suite, and nothing flagged it: types do not, and CI has no real data to lose. Now a launch
// without one has to be asked for by name (`launchQuietSwitchOnly`).
//
// The ordinary launch returns only after `firstWindow()` has returned. An e2e case replaces one of the app's IPC handlers
// only after that point (the header of screenshot.spec.ts gives the reason), so a case can do it right after the launch.
//
// The unit case for the options built here is quiet-launch.spec.ts, beside this file.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

/** The arguments and the full environment a launch gives the app */
export interface QuietLaunchOptions {
  args: string[]
  env: Record<string, string>
}

export interface QuietLaunchExtras {
  /** Environment variables the app is given as well. The quiet ones win over an entry of the same name. */
  env?: Record<string, string>
  /** Electron options placed before the app path, such as `['-r', module]` to preload a module into the main process */
  electronArgs?: string[]
  /**
   * Called right after the process has started and before the launch waits for the window, for what has to see the
   * start-up itself, such as a listener on the app's stderr
   */
  onLaunch?: (app: ElectronApplication) => void
}

export interface LaunchedApp {
  app: ElectronApplication
  /** The first window, with its `domcontentloaded` already reached */
  page: Page
}

function buildOptions(
  userData: string,
  inherited: NodeJS.ProcessEnv,
  { env = {}, electronArgs = [], switchOnly = false }: Pick<QuietLaunchExtras, 'env' | 'electronArgs'> & {
    switchOnly?: boolean
  }
): QuietLaunchOptions {
  const base: Record<string, string> = {}
  for (const [name, value] of Object.entries(inherited)) {
    if (value === undefined) continue
    if (switchOnly && name.toUpperCase().startsWith('TRANSFER_')) continue
    base[name] = value
  }
  return {
    args: [...electronArgs, '.', `--user-data-dir=${userData}`],
    env: {
      ...base,
      ...env,
      NODE_ENV: 'production',
      TRANSFER_E2E_QUIET: '1',
      ...(switchOnly ? {} : { TRANSFER_USERDATA: userData })
    }
  }
}

/**
 * The options of an ordinary quiet launch whose data lives in `userData`. `inherited` is the environment the launch starts
 * from: the real one, unless a test of this function gives its own.
 */
export function quietLaunchOptions(
  userData: string,
  extras: Pick<QuietLaunchExtras, 'env' | 'electronArgs'> = {},
  inherited: NodeJS.ProcessEnv = process.env
): QuietLaunchOptions {
  return buildOptions(userData, inherited, extras)
}

/**
 * The options of the launch that gives the data directory by `--user-data-dir` alone, with every inherited `TRANSFER_*`
 * variable removed: whatever lands in the directory got there by the switch.
 */
export function switchOnlyLaunchOptions(userData: string, inherited: NodeJS.ProcessEnv = process.env): QuietLaunchOptions {
  return buildOptions(userData, inherited, { switchOnly: true })
}

function start(options: QuietLaunchOptions): Promise<ElectronApplication> {
  return electron.launch(options)
}

/** Starts a quiet instance on `userData` and returns it with its first window loaded */
export async function launchQuiet(userData: string, extras: QuietLaunchExtras = {}): Promise<LaunchedApp> {
  const app = await start(quietLaunchOptions(userData, extras))
  try {
    extras.onLaunch?.(app)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return { app, page }
  } catch (error) {
    // The caller never receives the app, so nobody else can close it
    await app.close().catch(() => {})
    throw error
  }
}

/**
 * Starts a quiet instance that is given its data directory by `--user-data-dir` alone, and does not wait for a window.
 * Only launch-inputs.spec.ts needs it: it proves the switch by itself puts the data where it names, which a launch that
 * also passes `TRANSFER_USERDATA` cannot show.
 */
export function launchQuietSwitchOnly(userData: string): Promise<ElectronApplication> {
  return start(switchOnlyLaunchOptions(userData))
}
