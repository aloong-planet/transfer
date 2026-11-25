// The options quiet-launch.ts builds, checked without starting Electron.
//
// It is a Playwright file, not a vitest one: vitest runs src/** only, and a `.test.ts` under e2e/ would be picked up by
// Playwright as well. The wiring around the options (the launch returning only after `firstWindow()`) is what every other
// spec in this directory runs through; screenshot.spec.ts is the one that fails if it breaks.
import { test, expect } from '@playwright/test'
import { quietLaunchOptions, switchOnlyLaunchOptions } from './quiet-launch'

const DIR = '/data/one'

test('a quiet launch keeps its data in the directory given, and runs quiet', () => {
  const { args, env } = quietLaunchOptions(DIR, {}, { PATH: '/usr/bin', NODE_ENV: 'development' })
  expect(args).toEqual(['.', `--user-data-dir=${DIR}`])
  expect(env).toEqual({
    PATH: '/usr/bin',
    NODE_ENV: 'production',
    TRANSFER_E2E_QUIET: '1',
    TRANSFER_USERDATA: DIR
  })
})

test('a quiet launch passes on the extras a spec gives, and no extra moves the data directory', () => {
  const { args, env } = quietLaunchOptions(
    DIR,
    { env: { TRANSFER_RECHECK_MS: '200', TRANSFER_USERDATA: '/elsewhere' }, electronArgs: ['-r', '/x/hold.cjs'] },
    { TRANSFER_USERDATA: '/real' }
  )
  // Electron's own options come before the app path, the data switch after it
  expect(args).toEqual(['-r', '/x/hold.cjs', '.', `--user-data-dir=${DIR}`])
  expect(env['TRANSFER_RECHECK_MS']).toBe('200')
  expect(env['TRANSFER_USERDATA']).toBe(DIR)
})

test('only the switch-only launch gives no TRANSFER_USERDATA, and it drops every inherited TRANSFER_ variable', () => {
  const { args, env } = switchOnlyLaunchOptions(DIR, {
    PATH: '/usr/bin',
    TRANSFER_USERDATA: '/real',
    TRANSFER_RECHECK_MS: '5'
  })
  expect(args).toEqual(['.', `--user-data-dir=${DIR}`])
  expect(env).toEqual({ PATH: '/usr/bin', NODE_ENV: 'production', TRANSFER_E2E_QUIET: '1' })
})
