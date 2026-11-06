// The decision of the launch guard (ADR-0024, mac-distribution::CON-006), against its bypass vectors.
//
// Known gaps, each held elsewhere:
// - launch-guard.ts's lines, which give this decision the real argv and environment, print the message and exit, run
//   only in a packaged build, which no unit or e2e test starts. The packaging check holds the exit code on the built
//   macOS app at every packaging (mac-distribution::REQ-006); the message on standard error, the Mac App Store build and
//   the Windows builds are checked by hand on real packages (docs/ops/mac-signing.md).
// - That the guard decides before the debugging port opens, and that nothing after it runs, is a property of Electron's
//   startup, measured on a real package rather than tested here.
import { describe, expect, it } from 'vitest'
import { launchRefusal, refusedLaunchInputs } from './launch-inputs'

/** Variable names present in a terminal process on macOS (values made up): none is an input to refuse */
const MAC_EVERYDAY = {
  HOME: '/Users/a',
  LOGNAME: 'a',
  PATH: '/usr/bin:/bin',
  SHELL: '/bin/zsh',
  TMPDIR: '/var/folders/x/T/',
  USER: 'a',
  XPC_FLAGS: '0x0',
  XPC_SERVICE_NAME: '0',
  __CFBundleIdentifier: 'com.apple.Terminal',
  SSH_AUTH_SOCK: '/private/tmp/com.apple.launchd.x/Listeners',
  LANG: 'en_US.UTF-8',
  TERM: 'xterm-256color'
}

/** A Windows environment as the portable build's launcher hands it on, with the variables electron-builder's launcher sets */
const WINDOWS_PORTABLE_EVERYDAY = {
  APPDATA: 'C:\\Users\\a\\AppData\\Roaming',
  LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  SystemRoot: 'C:\\WINDOWS',
  windir: 'C:\\WINDOWS',
  USERPROFILE: 'C:\\Users\\a',
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
  Path: 'C:\\WINDOWS\\system32',
  PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\a\\Downloads',
  PORTABLE_EXECUTABLE_FILE: 'C:\\Users\\a\\Downloads\\Transfer-1.2.2-win-portable.exe',
  PORTABLE_EXECUTABLE_APP_FILENAME: 'Transfer'
}

describe('the launch inputs a packaged build refuses (mac-distribution::CON-006)', () => {
  it.each([
    ['macOS', MAC_EVERYDAY],
    ['a Windows portable launch', WINDOWS_PORTABLE_EVERYDAY]
  ])('refuses nothing on a launch with no arguments in an everyday environment: %s', (_where, env) => {
    expect(refusedLaunchInputs([], env)).toEqual([])
  })

  it.each(['--user-data-dir=/tmp/x', '--user-data-dir=C:\\Users\\a\\x'])('refuses nothing on a launch with only the settings directory: %s', (arg) => {
    expect(refusedLaunchInputs([arg], MAC_EVERYDAY)).toEqual([])
  })

  it('accepts the token older macOS versions passed to every launch', () => {
    expect(refusedLaunchInputs(['-psn_0_12345'], {})).toEqual([])
  })

  it.each([
    ['--remote-debugging-port=0', '--remote-debugging-port'],
    ['-remote-debugging-port=0', '-remote-debugging-port'],
    ['--remote-debugging-pipe', '--remote-debugging-pipe'],
    ['--gpu-launcher=/tmp/program', '--gpu-launcher'],
    ['--js-flags=--expose-gc', '--js-flags'],
    ['--type=', '--type'],
    ['--', '--']
  ])('refuses a switch measured to open a door, by its name: %s', (arg, name) => {
    expect(refusedLaunchInputs([arg], {})).toEqual([name])
  })

  it.each([
    ['--transfer-probe-unknown', '--transfer-probe-unknown'],
    ['-x', '-x']
  ])('refuses a switch nobody has listed: %s', (arg, name) => {
    expect(refusedLaunchInputs([arg], {})).toEqual([name])
  })

  it.each(['/remote-debugging-port=0', 'C:\\Users\\a\\file.txt', '/tmp/file', 'file.txt'])(
    'refuses an argument that is not written as a dash switch, named by a placeholder: %s',
    (arg) => {
      expect(refusedLaunchInputs([arg], {})).toEqual(['<argument>'])
    }
  )

  it.each([
    ['--USER-DATA-DIR=/tmp/x', '--USER-DATA-DIR'],
    ['-user-data-dir=/tmp/x', '-user-data-dir'],
    ['--user-data-dir-x=/tmp/x', '--user-data-dir-x'],
    ['--user-data-dirx=/tmp/x', '--user-data-dirx'],
    ['--user-data-dir', '--user-data-dir']
  ])('refuses what only resembles the settings directory: %s', (arg, name) => {
    expect(refusedLaunchInputs([arg], {})).toEqual([name])
  })

  it('names every refused argument in order, beside an accepted one that shields none of them', () => {
    expect(refusedLaunchInputs(['--a=1', '--user-data-dir=/tmp/x', '/tmp/f', '--b'], {})).toEqual(['--a', '<argument>', '--b'])
  })

  it.each(['http://127.0.0.1:5173/', ''])('refuses the development server URL whatever its value: "%s"', (value) => {
    expect(refusedLaunchInputs([], { ELECTRON_RENDERER_URL: value })).toEqual(['ELECTRON_RENDERER_URL'])
  })

  it.each(['TRANSFER_E2E_QUIET', 'TRANSFER_USERDATA', 'TRANSFER_PORT', 'TRANSFER_RECHECK_MS', 'TRANSFER_A_SEAM_NOT_WRITTEN_YET'])(
    'refuses a test seam by its prefix: %s',
    (name) => {
      expect(refusedLaunchInputs([], { [name]: '1' })).toEqual([name])
    }
  )

  it.each(['transfer_port', 'Transfer_UserData', 'electron_renderer_url'])(
    'refuses a variable in any letter case, as Windows would still read it: %s',
    (name) => {
      expect(refusedLaunchInputs([], { [name]: '1' })).toEqual([name])
    }
  )

  it.each(['TRANSFER', 'XTRANSFER_Y', 'ELECTRON_RENDERER_URL_X', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS'])(
    'leaves alone what is not a seam, and what the fuses close: %s',
    (name) => {
      expect(refusedLaunchInputs([], { [name]: '1' })).toEqual([])
    }
  )

  it('never carries a value, which could hold a path or a URL', () => {
    const refused = refusedLaunchInputs(['--gpu-launcher=/Users/a/secret/program', '/Users/a/secret/file'], {
      TRANSFER_USERDATA: '/Users/a/secret',
      ELECTRON_RENDERER_URL: 'http://secret.example/'
    })
    expect(refused).toEqual(['--gpu-launcher', '<argument>', 'TRANSFER_USERDATA', 'ELECTRON_RENDERER_URL'])
    expect(JSON.stringify(refused)).not.toContain('secret')
  })
})

describe('what a launch does about its inputs (mac-distribution::CON-006)', () => {
  it('does nothing in a run from source, whatever it carries (mac-distribution::CON-006/AC-05)', () => {
    expect(
      launchRefusal({
        packaged: false,
        argv: ['/x/Electron', '.', '--remote-debugging-port=9222'],
        env: { TRANSFER_USERDATA: '/tmp', ELECTRON_RENDERER_URL: 'http://localhost/' }
      })
    ).toBeNull()
  })

  it('does nothing in a packaged build with nothing to refuse', () => {
    expect(launchRefusal({ packaged: true, argv: ['/Applications/Transfer.app/Contents/MacOS/Transfer'], env: MAC_EVERYDAY })).toBeNull()
  })

  it('counts the first argument after the executable', () => {
    expect(launchRefusal({ packaged: true, argv: ['/x/Transfer', '--gpu-launcher=/tmp/program'], env: {} })).toEqual({
      message: 'Transfer: an installed copy does not start with --gpu-launcher.',
      exitCode: 64
    })
  })

  it('does not read the executable itself as an input', () => {
    expect(launchRefusal({ packaged: true, argv: ['-odd/Transfer'], env: {} })).toBeNull()
  })

  it('says every refused input on one line, arguments then variables, with no value (mac-distribution::CON-006/AC-03)', () => {
    expect(
      launchRefusal({
        packaged: true,
        argv: ['/x/Transfer', '--a=/Users/a/secret', '/tmp/f', '--user-data-dir=/tmp/x'],
        env: { TRANSFER_PORT: '1' }
      })
    ).toEqual({ message: 'Transfer: an installed copy does not start with --a, <argument>, TRANSFER_PORT.', exitCode: 64 })
  })
})
