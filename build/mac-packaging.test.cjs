// Tests for mac-packaging.cjs (copy both files into the project together; run with `node --test <dir>`).
//
// Every external command goes through an injected runner, so these tests check which commands run, in what
// order, what fails and with which message. They never contact Apple and never build an app: a green run here
// says nothing about a real signature or a real notarization. Those are verified by real packaging runs.
//
// `main` runs real commands and is tested only for its argument and location checks and for the DMG gate checking the
// artifact set before it runs any command: the hook path it derives and the DMG gate's loop over the selected DMGs
// are covered only by a real release packaging run, which is also the only check of a real ZIP's extraction and of
// the app inside it. The launch gate's decisions run against an injected launcher. Two things here do start a real process:
// launchApp, its adapter, starts shell scripts, and one case runs the gate's generated program. Whether a real app refuses
// is what a real packaging run shows.
const { test, describe, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const mac = require('./mac-packaging.cjs')

const ARCHES = ['universal', 'arm64', 'x64']
const BUILD_SUBDIRS = ['mac', 'mac-arm64', 'mac-universal']
const LIPO_ANSWERS = { mac: 'x86_64', 'mac-arm64': 'arm64', 'mac-universal': 'x86_64 arm64' }
const PRODUCT = 'Demo'
const VERSION = '1.2.1'
const APPLE_ENV = { APPLE_ID: 'developer@example.com', APPLE_APP_SPECIFIC_PASSWORD: 'app-password', APPLE_TEAM_ID: 'TEAM123456' }

const CONFIG = {
  productName: PRODUCT,
  directories: { output: 'release/${version}' },
  mac: { notarize: false, target: [{ target: 'dmg', arch: ['universal', 'arm64', 'x64'] }] },
  dmg: { artifactName: '${productName}-${version}-mac-${arch}.dmg', sign: true }
}
// The same project shipping electron-updater's ZIP too, configured as a real electron-builder 26.17.0 build accepts it
const ZIP_CONFIG = {
  ...CONFIG,
  mac: {
    notarize: false,
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    target: [{ target: 'dmg', arch: ['universal', 'arm64', 'x64'] }, { target: 'zip', arch: ['universal', 'arm64', 'x64'] }]
  },
  dmg: { ...CONFIG.dmg, writeUpdateInfo: false }
}

// Shaped after real `security find-identity -v -p codesigning` output (hashes and names replaced)
const IDENTITIES_WITH_DEVELOPER_ID = [
  '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Developer ID Application: Example Dev (TEAM123456)"',
  '  2) 89ABCDEF0123456789ABCDEF0123456789ABCDEF "Apple Development: Example Dev (DEVTEAM999)"',
  '     2 valid identities found'
].join('\n')
const IDENTITIES_WITHOUT_DEVELOPER_ID = [
  '  1) 89ABCDEF0123456789ABCDEF0123456789ABCDEF "Apple Development: Example Dev (DEVTEAM999)"',
  '  2) FEDCBA9876543210FEDCBA9876543210FEDCBA98 "Apple Distribution: Example Dev (TEAM123456)"',
  '     2 valid identities found'
].join('\n')

// Shaped after real `codesign --display --verbose=4` output, which codesign writes to stderr
const SIGNED_DEVELOPER_ID = [
  'Format=app bundle with Mach-O thin (arm64)',
  'Authority=Developer ID Application: Example Dev (TEAM123456)',
  'Authority=Developer ID Certification Authority',
  'Authority=Apple Root CA',
  'Timestamp=Aug 22, 2026 at 17:50:50',
  'TeamIdentifier=TEAM123456'
].join('\n')
const SIGNED_APP_STORE = [
  'Format=app bundle with Mach-O universal (x86_64 arm64)',
  'Authority=Apple Mac OS Application Signing',
  'Authority=Apple Worldwide Developer Relations Certification Authority',
  'Authority=Apple Root CA',
  'TeamIdentifier=TEAM123456'
].join('\n')
const SIGNED_ADHOC = ['Format=app bundle with Mach-O thin (arm64)', 'Signature=adhoc', 'TeamIdentifier=not set'].join('\n')
const DMG_SIGNED = ['Authority=Developer ID Application: Example Dev (TEAM123456)', 'Timestamp=Aug 22, 2026 at 17:51:02', 'TeamIdentifier=TEAM123456'].join('\n')
const DMG_OTHER_TEAM = ['Authority=Developer ID Application: Someone Else (OTHERTEAM1)', 'Timestamp=Aug 22, 2026 at 17:51:02', 'TeamIdentifier=OTHERTEAM1'].join('\n')

const keychain = (stdout) => (command, args) => {
  if (command === 'security' && args[0] === 'find-identity') return { stdout, stderr: '' }
  throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
}

// Real temporary directories stand in for the build output; only external commands are faked.
const tempDirs = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-packaging-test-'))
  tempDirs.push(dir)
  return dir
}

function makeApps(outputDir, subdirs) {
  for (const subdir of subdirs) {
    const macos = path.join(outputDir, subdir, `${PRODUCT}.app`, 'Contents', 'MacOS')
    fs.mkdirSync(macos, { recursive: true })
    fs.writeFileSync(path.join(macos, PRODUCT), '')
  }
}

function buildOutput(subdirs) {
  const outputDir = tempDir()
  makeApps(outputDir, subdirs)
  return outputDir
}

/** A `lipo -archs` runner answering from a table keyed by the build subdirectory */
const lipo = (bySubdir) => (command, args) => {
  if (command !== 'lipo' || args[0] !== '-archs') throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  const subdir = Object.keys(bySubdir).find((key) => args[1].includes(`/${key}/${PRODUCT}.app/`))
  if (!subdir) throw new Error(`no lipo answer for ${args[1]}`)
  return { stdout: `${bySubdir[subdir]}\n`, stderr: '' }
}

const dmgPath = (outputDir, arch) => path.join(outputDir, `${PRODUCT}-${VERSION}-mac-${arch}.dmg`)
const zipPath = (outputDir, arch) => path.join(outputDir, `${PRODUCT}-${VERSION}-mac-${arch}.zip`)
const appPath = (outputDir, subdir) => path.join(outputDir, subdir, `${PRODUCT}.app`)

/**
 * A recording runner for one packaging build. Like the real builder, the apps and DMGs exist only once
 * electron-builder has run; it writes a DMG for every arch unless the arch is in `skipDmg`, and with `zip` a ZIP
 * unless the arch is in `skipZip`. codesign answers apps with `appSignature` (or a per-subdir override) and DMGs with
 * `dmgSignature`; `stapler validate` fails for apps whose subdir is in `unstapled`.
 *
 * `ditto -x -k` extracts a ZIP the way a real one comes out: the app alone at the top, plus the files named in
 * `zipExtras[arch]`, and a read-only directory inside the app when the arch is in `zipLocked`. The app extracted from
 * an arch's ZIP is answered with `zipAppSignature[arch]` (default: signed correctly), and fails `stapler validate` when
 * the arch is in `unstapledZip`. `extractions` lists every extraction.
 */
function buildRunner(outputDir, opts = {}) {
  const commands = []
  const extractions = []
  const extractionOf = (target) => extractions.find((e) => target.startsWith(`${e.dir}${path.sep}`))
  const run = (command, args) => {
    commands.push([command, ...args].join(' '))
    if (command === 'lipo') return lipo(LIPO_ANSWERS)(command, args)
    if (command === 'electron-builder') {
      makeApps(outputDir, BUILD_SUBDIRS)
      for (const arch of ARCHES) {
        if (!(opts.skipDmg ?? []).includes(arch)) fs.writeFileSync(dmgPath(outputDir, arch), 'new')
        if (opts.zip && !(opts.skipZip ?? []).includes(arch)) fs.writeFileSync(zipPath(outputDir, arch), `zip for ${arch}`)
      }
      return { stdout: '', stderr: '' }
    }
    if (command === 'ditto' && args[0] === '-x') {
      const extraction = { arch: /-mac-([a-z0-9]+)\.zip$/.exec(args[2])[1], dir: args[3] }
      extractions.push(extraction)
      makeApps(extraction.dir, [''])
      for (const name of opts.zipExtras?.[extraction.arch] ?? []) fs.writeFileSync(path.join(extraction.dir, name), '')
      if ((opts.zipLocked ?? []).includes(extraction.arch)) {
        // A read-only directory with a file in it, which makes removing the extraction throw
        const locked = path.join(extraction.dir, `${PRODUCT}.app`, 'Contents', 'locked')
        fs.mkdirSync(locked)
        fs.writeFileSync(path.join(locked, 'file'), '')
        fs.chmodSync(locked, 0o555)
      }
      return { stdout: '', stderr: '' }
    }
    const extracted = args.length > 0 ? extractionOf(args.at(-1)) : undefined
    if (extracted && command === 'codesign' && args[0] === '--display') {
      return { stdout: '', stderr: opts.zipAppSignature?.[extracted.arch] ?? SIGNED_DEVELOPER_ID }
    }
    if (extracted && command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') {
      if ((opts.unstapledZip ?? []).includes(extracted.arch)) throw new Error(`${args[2]} does not have a ticket stapled to it.`)
      return { stdout: '', stderr: '' }
    }
    if (command === 'codesign' && args[0] === '--display') {
      const target = args.at(-1)
      if (target.endsWith('.dmg')) return { stdout: '', stderr: opts.dmgSignature ?? DMG_SIGNED }
      const subdir = Object.keys(opts.appOverrides ?? {}).find((key) => target.includes(`/${key}/`))
      return { stdout: '', stderr: subdir ? opts.appOverrides[subdir] : SIGNED_DEVELOPER_ID }
    }
    if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') {
      if ((opts.unstapled ?? []).some((subdir) => args[2].includes(`/${subdir}/`))) throw new Error(`${args[2]} does not have a ticket stapled to it.`)
    }
    return { stdout: '', stderr: '' }
  }
  return { commands, run, extractions }
}

/** Whether a launch is the plain one: only the settings directory, and no refused variable */
const isPlainLaunch = (args, env) => args.length === 1 && env.ELECTRON_RENDERER_URL === undefined

/**
 * A built app as the launch gate sees it. By default it refuses every input with exit code 64 and stays up on the plain
 * launch; `answer` overrides that per launch, and `calls` records every one.
 */
function launcher(answer = () => undefined) {
  const calls = []
  const launch = (binary, args, env, limit) => {
    calls.push({ binary, args, env, limit })
    return answer({ binary, args, env }) ?? (isPlainLaunch(args, env) ? { exited: false } : { exited: true, status: 64, signal: null })
  }
  return { calls, launch }
}

const pkg = (outputDir, run, profile, env = { CSC_LINK: 'base64-p12' }, zip = false, launch = launcher().launch) =>
  mac.packageMac({ profile, env, run, outputDir, productName: PRODUCT, version: VERSION, arches: ARCHES, zip, hookPath: 'build/mac-packaging.cjs', launch, hostArch: 'arm64', log: () => {} })

/** The commands with each extraction directory, whose name is random, shown as `<zip:arch>` */
const withExtractions = (commands, extractions) =>
  commands.map((c) => extractions.reduce((shown, e) => shown.split(e.dir).join(`<zip:${e.arch}>`), c))

describe('configuration', () => {
  test('reads the DMG target architectures in config order', () => {
    assert.deepEqual(mac.configuredArches(CONFIG), ['universal', 'arm64', 'x64'])
  })

  for (const [name, target, message] of [
    ['no dmg target', [{ target: 'zip', arch: ['arm64'] }], 'electron-builder.yml has no mac dmg target with an arch list'],
    ['an unknown arch', [{ target: 'dmg', arch: ['arm64', 'ia32'] }], 'unsupported mac arch in electron-builder.yml: ia32'],
    ['an arch listed twice', [{ target: 'dmg', arch: ['arm64', 'arm64'] }], 'electron-builder.yml lists a mac arch twice']
  ]) {
    test(`fails on ${name}`, () => {
      assert.throws(() => mac.configuredArches({ mac: { target } }), { message })
    })
  }

  test('product name, version, output directory and arches come from the project files', () => {
    assert.deepEqual(mac.resolveLayout(CONFIG, JSON.stringify({ version: '9.8.7' })), {
      productName: PRODUCT, version: '9.8.7', outputDir: 'release/9.8.7', arches: ARCHES, zip: false
    })
  })

  test('a zip target with the dmg target\'s arches opts the ZIP in, in whatever order it lists them', () => {
    assert.deepEqual(mac.resolveLayout(ZIP_CONFIG, JSON.stringify({ version: '9.8.7' })), {
      productName: PRODUCT, version: '9.8.7', outputDir: 'release/9.8.7', arches: ARCHES, zip: true
    })
    const reordered = structuredClone(ZIP_CONFIG)
    reordered.mac.target[1].arch = ['x64', 'universal', 'arm64']
    assert.equal(mac.resolveLayout(reordered, JSON.stringify({ version: '9.8.7' })).zip, true)
  })

  for (const [name, change, message] of [
    ['a zip target for other arches', (c) => { c.mac.target[1].arch = ['arm64'] },
      'the mac zip target must list the same arches as the dmg target: universal, arm64, x64 (found: arm64)'],
    // A bare target name has no arch list, and must not slip past as "no ZIP"
    ['a zip target without an arch list', (c) => { c.mac.target[1] = 'zip' },
      'the mac zip target must list the same arches as the dmg target: universal, arm64, x64 (found: no arch list)'],
    // electron-builder rejects a zip options block, so the ZIP is named by mac.artifactName
    ['no mac.artifactName', (c) => { delete c.mac.artifactName },
      'with the zip target, electron-builder.yml must set mac.artifactName: ${productName}-${version}-mac-${arch}.${ext} (found: nothing)'],
    ['another mac.artifactName', (c) => { c.mac.artifactName = '${productName}-${version}-${arch}-mac.${ext}' },
      'with the zip target, electron-builder.yml must set mac.artifactName: ${productName}-${version}-mac-${arch}.${ext} (found: ${productName}-${version}-${arch}-mac.${ext})'],
    // The DMG gate staples each DMG after electron-builder hashed it, so a DMG entry in the update metadata would be stale
    ['the DMG still written into the update metadata', (c) => { delete c.dmg.writeUpdateInfo },
      'with the zip target, electron-builder.yml must set dmg.writeUpdateInfo: false (found: nothing)']
  ]) {
    test(`the ZIP opt-in is refused before building with ${name}`, () => {
      const config = structuredClone(ZIP_CONFIG)
      change(config)
      assert.throws(() => mac.resolveLayout(config, JSON.stringify({ version: '1.0.0' })), { message })
    })
  }

  test('an output directory using a macro other than ${version} is refused rather than guessed', () => {
    const config = { ...CONFIG, directories: { output: 'release/${arch}/${version}' } }
    assert.throws(() => mac.resolveLayout(config, JSON.stringify({ version: '9.8.7' })), {
      message: 'directories.output may only use ${version}: release/${arch}/${version}'
    })
  })

  test('the DMG name pattern is required, and the error says what to write', () => {
    // The default pattern drops the arch for the default architecture, so a file could not be mapped to its arch
    const withoutDmg = structuredClone(CONFIG)
    delete withoutDmg.dmg
    assert.throws(() => mac.resolveLayout(withoutDmg, JSON.stringify({ version: '1.0.0' })), {
      message: 'electron-builder.yml must set dmg.artifactName: ${productName}-${version}-mac-${arch}.dmg (found: nothing)'
    })
    assert.throws(() => mac.resolveLayout({ ...CONFIG, dmg: { artifactName: '${productName}-${version}-${arch}.${ext}' } }, JSON.stringify({ version: '1.0.0' })), {
      message: 'electron-builder.yml must set dmg.artifactName: ${productName}-${version}-mac-${arch}.dmg (found: ${productName}-${version}-${arch}.${ext})'
    })
  })

  test('the DMG must be signed, and the error says what to write', () => {
    // Without dmg.sign electron-builder leaves the DMG unsigned, which the signature check would find only after the build
    const unsigned = structuredClone(CONFIG)
    delete unsigned.dmg.sign
    assert.throws(() => mac.resolveLayout(unsigned, JSON.stringify({ version: '1.0.0' })), {
      message: 'electron-builder.yml must set dmg.sign: true (found: nothing)'
    })
    assert.throws(() => mac.resolveLayout({ ...CONFIG, dmg: { ...CONFIG.dmg, sign: false } }, JSON.stringify({ version: '1.0.0' })), {
      message: 'electron-builder.yml must set dmg.sign: true (found: false)'
    })
  })

  test('a config without productName is refused', () => {
    const withoutName = structuredClone(CONFIG)
    delete withoutName.productName
    assert.throws(() => mac.resolveLayout(withoutName, JSON.stringify({ version: '1.0.0' })), { message: 'electron-builder.yml has no productName' })
  })

  test('js-yaml comes from electron-builder\'s dependency tree, and its absence is explained', () => {
    assert.equal(typeof mac.yamlParser().load, 'function')
    const notFound = new Error("Cannot find module 'electron-builder/package.json'")
    const missing = () => { throw notFound }
    assert.throws(() => mac.yamlParser(missing), (error) => {
      assert.match(error.message, /cannot load js-yaml through electron-builder .*is electron-builder installed\?/)
      assert.equal(error.cause, notFound)
      return true
    })
  })
})

describe('certificate source check', () => {
  test('a Developer ID Application identity in the keychain is accepted', () => {
    assert.equal(mac.certificateSource({}, keychain(IDENTITIES_WITH_DEVELOPER_ID)), 'keychain: Developer ID Application: Example Dev (TEAM123456)')
  })

  test('no Developer ID Application identity fails with the install hint', () => {
    assert.throws(() => mac.certificateSource({}, keychain(IDENTITIES_WITHOUT_DEVELOPER_ID)), /no valid "Developer ID Application" signing identity[\s\S]*security find-identity -v$/)
  })

  test('CSC_LINK is accepted without reading the keychain, since the builder imports it', () => {
    assert.equal(mac.certificateSource({ CSC_LINK: 'base64-p12' }, () => { throw new Error('the keychain must not be queried') }), 'CSC_LINK')
  })

  test('an empty CSC_LINK does not count as a certificate', () => {
    assert.throws(() => mac.certificateSource({ CSC_LINK: '  ' }, keychain(IDENTITIES_WITHOUT_DEVELOPER_ID)), /no valid "Developer ID Application" signing identity/)
  })
})

describe('locating the built apps', () => {
  test('identifies each app by its binary architectures, whatever its directory is called', () => {
    const outputDir = buildOutput(BUILD_SUBDIRS)
    assert.deepEqual(mac.findBuiltApps({ outputDir, productName: PRODUCT, arches: ARCHES, run: lipo(LIPO_ANSWERS) }), [
      { arch: 'universal', app: appPath(outputDir, 'mac-universal') },
      { arch: 'arm64', app: appPath(outputDir, 'mac-arm64') },
      { arch: 'x64', app: appPath(outputDir, 'mac') }
    ])
  })

  for (const [name, subdirs, answers, message] of [
    ['nothing has been built', [], {}, 'no built Demo.app under'],
    ['an arch is missing', ['mac-arm64', 'mac-universal'], { 'mac-arm64': 'arm64', 'mac-universal': 'x86_64 arm64' }, 'no built app for x64 under'],
    ['a binary has unexpected architectures', [...BUILD_SUBDIRS, 'mac-old'], { ...LIPO_ANSWERS, 'mac-old': 'i386' }, 'unexpected binary architectures: i386'],
    // A universal build that crashed leaves its per-arch build behind in <outDir>-<arch>-temp
    ['a crashed universal build left its arm64 temp app behind', [...BUILD_SUBDIRS, 'mac-universal-arm64-temp'], { ...LIPO_ANSWERS, 'mac-universal-arm64-temp': 'arm64' }, 'two built apps for arm64']
  ]) {
    test(`fails when ${name}`, () => {
      const outputDir = buildOutput(subdirs)
      assert.throws(() => mac.findBuiltApps({ outputDir, productName: PRODUCT, arches: ARCHES, run: lipo(answers) }), (error) => error.message.includes(message))
    })
  }

  test('fails on a leftover app for an arch the config no longer lists', () => {
    const outputDir = buildOutput(['mac', 'mac-arm64'])
    assert.throws(() => mac.findBuiltApps({ outputDir, productName: PRODUCT, arches: ['arm64'], run: lipo({ mac: 'x86_64', 'mac-arm64': 'arm64' }) }), {
      message: `built app for an arch the config does not list (x64): ${appPath(outputDir, 'mac')}`
    })
  })
})

describe('one build, local profile', () => {
  test('builds the apps and DMGs in one builder call with notarization off and no hook, then checks every signature', () => {
    const outputDir = tempDir()
    const { commands, run } = buildRunner(outputDir)

    const result = pkg(outputDir, run, 'local')

    assert.deepEqual(result.dmgs, ARCHES.map((arch) => dmgPath(outputDir, arch)))
    assert.deepEqual(commands.filter((c) => !c.startsWith('lipo')), [
      'electron-vite build',
      'electron-builder --mac --publish never -c.mac.notarize=false',
      ...['mac-universal', 'mac-arm64', 'mac'].flatMap((s) => [
        `codesign --display --verbose=4 ${appPath(outputDir, s)}`,
        `codesign --verify --deep --strict --verbose=2 ${appPath(outputDir, s)}`
      ]),
      ...ARCHES.flatMap((arch) => [`codesign --verify --verbose=4 ${dmgPath(outputDir, arch)}`, `codesign --display --verbose=4 ${dmgPath(outputDir, arch)}`])
    ])
  })

  test('fails before building anything when there is no certificate', () => {
    const outputDir = tempDir()
    const commands = []
    const run = (command, args) => { commands.push([command, ...args].join(' ')); return keychain(IDENTITIES_WITHOUT_DEVELOPER_ID)(command, args) }
    assert.throws(() => pkg(outputDir, run, 'local', {}), /no valid "Developer ID Application" signing identity/)
    assert.deepEqual(commands, ['security find-identity -v -p codesigning'])
  })

  for (const [name, signature] of [['an ad-hoc signature', SIGNED_ADHOC], ['an App Store signature', SIGNED_APP_STORE]]) {
    test(`fails on ${name} instead of shipping it`, () => {
      const outputDir = tempDir()
      const { run } = buildRunner(outputDir, { appOverrides: { 'mac-arm64': signature } })
      assert.throws(() => pkg(outputDir, run, 'local'), { message: `not signed with a Developer ID Application identity: ${appPath(outputDir, 'mac-arm64')}` })
    })
  }

  test('fails when the builder left no DMG for an arch', () => {
    const outputDir = tempDir()
    const { run } = buildRunner(outputDir, { skipDmg: ['x64'] })
    assert.throws(() => pkg(outputDir, run, 'local'), { message: `no DMG for x64 after the build: ${dmgPath(outputDir, 'x64')}` })
  })

  test('fails when a DMG is signed by a different team from the app inside it', () => {
    const outputDir = tempDir()
    const { run } = buildRunner(outputDir, { dmgSignature: DMG_OTHER_TEAM })
    assert.throws(() => pkg(outputDir, run, 'local'), { message: 'DMG Team ID does not match: expected TEAM123456' })
  })
})

describe('one build, release profile', () => {
  test('adds this file as the afterSign hook to the same builder call, and confirms every app carries its ticket', () => {
    const outputDir = tempDir()
    const { commands, run } = buildRunner(outputDir)
    pkg(outputDir, run, 'release', { CSC_LINK: 'base64-p12', ...APPLE_ENV })
    assert.ok(commands.includes('electron-builder --mac --publish never -c.mac.notarize=false -c.afterSign=build/mac-packaging.cjs'))
    for (const s of ['mac-universal', 'mac-arm64', 'mac']) assert.ok(commands.includes(`xcrun stapler validate ${appPath(outputDir, s)}`), s)
  })

  test('refuses to build without every Apple credential', () => {
    const outputDir = tempDir()
    const { commands, run } = buildRunner(outputDir)
    assert.throws(() => pkg(outputDir, run, 'release', { CSC_LINK: 'base64-p12', APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b' }), { message: 'missing Apple notarization credentials: APPLE_TEAM_ID' })
    assert.deepEqual(commands, [])
  })

  test('fails when an app came out of the build without a stapled ticket (the hook did not run on it)', () => {
    const outputDir = tempDir()
    const { run } = buildRunner(outputDir, { unstapled: ['mac'] })
    assert.throws(() => pkg(outputDir, run, 'release', { CSC_LINK: 'base64-p12', ...APPLE_ENV }), /does not have a ticket stapled to it/)
  })
})

describe('one build with the ZIP electron-updater installs from', () => {
  test('local packaging checks the app inside each ZIP in a temporary extraction, which it removes, and asks for no ticket', () => {
    const outputDir = tempDir()
    const { commands, run, extractions } = buildRunner(outputDir, { zip: true })

    const result = pkg(outputDir, run, 'local', undefined, true)

    assert.deepEqual(result.zips, ARCHES.map((arch) => zipPath(outputDir, arch)))
    assert.deepEqual(withExtractions(commands, extractions).filter((c) => !c.startsWith('lipo')), [
      'electron-vite build',
      'electron-builder --mac --publish never -c.mac.notarize=false',
      ...['mac-universal', 'mac-arm64', 'mac'].flatMap((s) => [
        `codesign --display --verbose=4 ${appPath(outputDir, s)}`,
        `codesign --verify --deep --strict --verbose=2 ${appPath(outputDir, s)}`
      ]),
      ...ARCHES.flatMap((arch) => [`codesign --verify --verbose=4 ${dmgPath(outputDir, arch)}`, `codesign --display --verbose=4 ${dmgPath(outputDir, arch)}`]),
      ...ARCHES.flatMap((arch) => [
        `ditto -x -k ${zipPath(outputDir, arch)} <zip:${arch}>`,
        `codesign --verify --deep --strict --verbose=2 <zip:${arch}>/${PRODUCT}.app`,
        `codesign --display --verbose=4 <zip:${arch}>/${PRODUCT}.app`
      ])
    ])
    assert.equal(extractions.length, ARCHES.length)
    assert.deepEqual(extractions.filter((e) => fs.existsSync(e.dir)), [])
  })

  test('release packaging also requires the app inside each ZIP to carry its stapled ticket', () => {
    const outputDir = tempDir()
    const { commands, run, extractions } = buildRunner(outputDir, { zip: true })
    pkg(outputDir, run, 'release', { CSC_LINK: 'base64-p12', ...APPLE_ENV }, true)
    const shown = withExtractions(commands, extractions)
    assert.deepEqual(shown.slice(shown.indexOf(`ditto -x -k ${zipPath(outputDir, ARCHES[0])} <zip:${ARCHES[0]}>`)), ARCHES.flatMap((arch) => [
      `ditto -x -k ${zipPath(outputDir, arch)} <zip:${arch}>`,
      `codesign --verify --deep --strict --verbose=2 <zip:${arch}>/${PRODUCT}.app`,
      `codesign --display --verbose=4 <zip:${arch}>/${PRODUCT}.app`,
      `xcrun stapler validate <zip:${arch}>/${PRODUCT}.app`
    ]))
  })

  test('a ZIP whose app has no stapled ticket fails the release, even though the built app has one', () => {
    const outputDir = tempDir()
    const { run, extractions } = buildRunner(outputDir, { zip: true, unstapledZip: ['arm64'] })
    assert.throws(() => pkg(outputDir, run, 'release', { CSC_LINK: 'base64-p12', ...APPLE_ENV }, true), (error) => {
      const arm64 = extractions.find((e) => e.arch === 'arm64')
      assert.equal(error.message, `${path.join(arm64.dir, `${PRODUCT}.app`)} does not have a ticket stapled to it.`)
      return true
    })
    assert.deepEqual(extractions.filter((e) => fs.existsSync(e.dir)), [])
  })

  const ZIP_APP = `${PRODUCT}-${VERSION}-mac-arm64.zip's app`
  for (const [name, signature, message] of [
    ['no Developer ID Application authority', SIGNED_ADHOC, `${ZIP_APP} is not signed by a Developer ID Application identity`],
    ['another Team ID', SIGNED_DEVELOPER_ID.replace('Example Dev (TEAM123456)', 'Someone Else (OTHERTEAM1)').replace('TeamIdentifier=TEAM123456', 'TeamIdentifier=OTHERTEAM1'),
      `${ZIP_APP} Team ID does not match: expected TEAM123456`],
    ['no secure timestamp', SIGNED_DEVELOPER_ID.split('\n').filter((line) => !line.startsWith('Timestamp=')).join('\n'), `${ZIP_APP} signature has no secure timestamp`]
  ]) {
    test(`a ZIP whose app has ${name} fails, even though the built app is signed correctly`, () => {
      const outputDir = tempDir()
      const { run } = buildRunner(outputDir, { zip: true, zipAppSignature: { arm64: signature } })
      assert.throws(() => pkg(outputDir, run, 'local', undefined, true), { message })
    })
  }

  for (const [outcome, signature, message] of [
    ['passed', undefined, null],
    ['failed', SIGNED_ADHOC, `${ZIP_APP} is not signed by a Developer ID Application identity`]
  ]) {
    test(`an extraction that cannot be fully removed leaves the outcome of a check that ${outcome} as it is`, () => {
      const outputDir = tempDir()
      const { run, extractions } = buildRunner(outputDir, { zip: true, zipLocked: ['arm64'], zipAppSignature: { arm64: signature } })
      try {
        if (message) assert.throws(() => pkg(outputDir, run, 'local', undefined, true), { message })
        else assert.deepEqual(pkg(outputDir, run, 'local', undefined, true).zips, ARCHES.map((arch) => zipPath(outputDir, arch)))
        // The removal did fail, so the case exercised what it is named for
        assert.equal(fs.existsSync(extractions.find((e) => e.arch === 'arm64').dir), true)
      } finally {
        for (const { dir } of extractions) {
          const locked = path.join(dir, `${PRODUCT}.app`, 'Contents', 'locked')
          if (fs.existsSync(locked)) fs.chmodSync(locked, 0o755)
          fs.rmSync(dir, { recursive: true, force: true })
        }
      }
    })
  }

  test('a ZIP that holds more than the app fails', () => {
    // electron-builder zips the app's directory, extra files included, when the config adds extraDistFiles
    const outputDir = tempDir()
    const { run } = buildRunner(outputDir, { zip: true, zipExtras: { arm64: ['README.txt'] } })
    assert.throws(() => pkg(outputDir, run, 'local', undefined, true), {
      message: `${PRODUCT}-${VERSION}-mac-arm64.zip must hold exactly ${PRODUCT}.app (found: ${PRODUCT}.app, README.txt)`
    })
  })

  test('the ZIP is never written: its bytes and time are the builder\'s, and only the extraction names it', () => {
    // The update metadata records each ZIP's hash, and the updater refuses a ZIP that no longer matches it
    const outputDir = tempDir()
    const { commands, run: inner } = buildRunner(outputDir, { zip: true })
    const built = new Map()
    const run = (command, args) => {
      const result = inner(command, args)
      if (command === 'electron-builder') for (const arch of ARCHES) built.set(arch, fs.statSync(zipPath(outputDir, arch)).mtimeMs)
      return result
    }
    pkg(outputDir, run, 'release', { CSC_LINK: 'base64-p12', ...APPLE_ENV }, true)
    for (const arch of ARCHES) {
      const zip = zipPath(outputDir, arch)
      assert.equal(fs.readFileSync(zip, 'utf8'), `zip for ${arch}`)
      assert.equal(fs.statSync(zip).mtimeMs, built.get(arch))
      assert.deepEqual(commands.filter((c) => c.includes(zip)).map((c) => c.split(' ').slice(0, 4).join(' ')), [`ditto -x -k ${zip}`])
    }
  })

  test('fails when the builder left no ZIP for an arch', () => {
    const outputDir = tempDir()
    const { run } = buildRunner(outputDir, { zip: true, skipZip: ['x64'] })
    assert.throws(() => pkg(outputDir, run, 'local', undefined, true), { message: `no ZIP for x64 after the build: ${zipPath(outputDir, 'x64')}` })
  })
})

describe('a rebuild leaves nothing from an earlier run behind', () => {
  test('a DMG left over from an earlier run does not pass as this run\'s output', () => {
    const outputDir = tempDir()
    fs.writeFileSync(dmgPath(outputDir, 'x64'), 'stale')
    const { run } = buildRunner(outputDir, { skipDmg: ['x64'] })
    assert.throws(() => pkg(outputDir, run, 'local'), /no DMG for x64 after the build/)
  })

  test('build output directories from an earlier run are cleared before the build, so a leftover app never reaches the hook', () => {
    // A crashed universal build leaves <outDir>-<arch>-temp behind; Mac App Store output (mas-*) is not ours to clear
    const outputDir = buildOutput([...BUILD_SUBDIRS, 'mac-universal-arm64-temp', 'mas-universal'])
    let seenAtBuild = []
    const { run: inner } = buildRunner(outputDir)
    const run = (command, args) => {
      if (command === 'electron-builder') seenAtBuild = [...BUILD_SUBDIRS, 'mac-universal-arm64-temp', 'mas-universal'].filter((d) => fs.existsSync(path.join(outputDir, d)))
      return inner(command, args)
    }
    try {
      pkg(outputDir, run, 'local')
    } catch {
      // only what was on disk when the build started is asserted
    }
    assert.deepEqual(seenAtBuild, ['mas-universal'])
  })

  for (const [zip, expected] of [[true, []], [false, [`${PRODUCT}-${VERSION}-mac-arm64.zip`, 'latest-mac.yml', 'beta-mac.yml']]]) {
    test(`${zip ? 'with the ZIP, leftover ZIPs and update metadata are cleared before the build' : 'DMG-only, ZIPs and update metadata are left as they are'}`, () => {
      // A build that writes no update metadata (no publish provider) must not pass with an earlier run's
      const outputDir = tempDir()
      const leftovers = [zipPath(outputDir, 'arm64'), path.join(outputDir, 'latest-mac.yml'), path.join(outputDir, 'beta-mac.yml')]
      for (const file of leftovers) fs.writeFileSync(file, 'stale')
      let seenAtBuild = null
      const { run: inner } = buildRunner(outputDir, { zip })
      const run = (command, args) => {
        if (command === 'electron-builder') seenAtBuild = leftovers.filter((file) => fs.existsSync(file)).map((file) => path.basename(file))
        return inner(command, args)
      }
      pkg(outputDir, run, 'local', undefined, zip)
      assert.deepEqual(seenAtBuild, expected)
    })
  }

  test('the notarization logs of the apps and DMGs being rebuilt are removed', () => {
    // A local package must never sit next to a log claiming it was notarized
    const outputDir = tempDir()
    const stale = ARCHES.flatMap((arch) => [
      path.join(outputDir, `${PRODUCT}-${VERSION}-mac-${arch}.app.notary-log.json`),
      `${dmgPath(outputDir, arch)}.notary-log.json`
    ])
    for (const file of stale) fs.writeFileSync(file, '{"status":"Accepted"}')
    const { run } = buildRunner(outputDir)
    pkg(outputDir, run, 'local')
    assert.deepEqual(stale.filter((file) => fs.existsSync(file)), [])
  })
})

/** A runner for notarization: `submit` answers Accepted unless the file name contains `reject`; `log` answers the matching log */
function notaryRunner(reject = null) {
  const commands = []
  const idOf = (file) => `id-${path.basename(file).replace(/[^a-z0-9]+/gi, '-')}`
  const run = (command, args) => {
    commands.push([command, ...args].join(' '))
    if (command === 'lipo') return lipo(LIPO_ANSWERS)(command, args)
    if (command === 'codesign' && args[0] === '--display') return { stdout: '', stderr: DMG_SIGNED }
    if (command === 'xcrun' && args[0] === 'notarytool' && args[1] === 'submit') {
      return { stdout: JSON.stringify({ id: idOf(args[2]), status: reject && args[2].includes(reject) ? 'Invalid' : 'Accepted' }), stderr: '' }
    }
    if (command === 'xcrun' && args[0] === 'notarytool' && args[1] === 'log') return { stdout: JSON.stringify({ jobId: args[2], status: 'Accepted', issues: [] }), stderr: '' }
    return { stdout: '', stderr: '' }
  }
  return { commands, run }
}

const signContext = (outputDir, subdir, platform = 'darwin') => ({
  electronPlatformName: platform,
  appOutDir: path.join(outputDir, subdir),
  outDir: outputDir,
  packager: { appInfo: { productFilename: PRODUCT, version: VERSION } }
})

const quietHook = (env, run, extra = {}) => ({ env, run, writeError: () => {}, writeNotaryLog: () => {}, log: () => {}, ...extra })

describe('afterSign hook: notarize each signed app before its DMG is built', () => {
  test('zips, submits, keeps the log, staples and validates the app it is called for', async () => {
    const outputDir = buildOutput(BUILD_SUBDIRS)
    const { commands, run } = notaryRunner()
    const logs = []
    const progress = []
    const id = await mac.afterSign(signContext(outputDir, 'mac-arm64'), quietHook(APPLE_ENV, run, {
      writeNotaryLog: (file, contents) => logs.push({ file, contents }),
      log: (message) => progress.push(message)
    }))
    const app = appPath(outputDir, 'mac-arm64')
    assert.equal(id, 'id-Demo-arm64-zip')
    const steps = commands.map((c) => c.replace(/ --apple-id .*$/, ''))
    assert.equal(steps[0], `lipo -archs ${path.join(app, 'Contents', 'MacOS', PRODUCT)}`)
    assert.match(steps[1], new RegExp(`^ditto -c -k --keepParent ${app} .*/Demo-arm64\\.zip$`))
    assert.match(steps[2], /^xcrun notarytool submit .*\/Demo-arm64\.zip$/)
    assert.deepEqual(steps.slice(3), ['xcrun notarytool log id-Demo-arm64-zip', `xcrun stapler staple ${app}`, `xcrun stapler validate ${app}`])
    assert.deepEqual(logs, [{ file: path.join(outputDir, `${PRODUCT}-${VERSION}-mac-arm64.app.notary-log.json`), contents: JSON.stringify({ jobId: 'id-Demo-arm64-zip', status: 'Accepted', issues: [] }) }])
    assert.deepEqual(progress, [`[mac] notarizing arm64: ${app}`, '[mac] accepted arm64 (submission: id-Demo-arm64-zip)'])
  })

  test('does nothing for a Mac App Store build', async () => {
    const outputDir = buildOutput(['mas-universal'])
    const { commands, run } = notaryRunner()
    await mac.afterSign(signContext(outputDir, 'mas-universal', 'mas'), quietHook(APPLE_ENV, run))
    assert.deepEqual(commands, [])
  })

  test('fails without every Apple credential instead of skipping', async () => {
    const outputDir = buildOutput(BUILD_SUBDIRS)
    const { commands, run } = notaryRunner()
    await assert.rejects(mac.afterSign(signContext(outputDir, 'mac'), quietHook({ APPLE_ID: 'a' }, run)), /APPLE_APP_SPECIFIC_PASSWORD/)
    assert.deepEqual(commands, [])
  })

  test('a rejected app fails the build with the original error, unstapled', async () => {
    const outputDir = buildOutput(BUILD_SUBDIRS)
    const { commands, run } = notaryRunner('arm64')
    await assert.rejects(mac.afterSign(signContext(outputDir, 'mac-arm64'), quietHook(APPLE_ENV, run)), { message: 'Apple notarization not accepted: Invalid (submission: id-Demo-arm64-zip)' })
    assert.equal(commands.some((c) => c.startsWith('xcrun stapler staple')), false)
  })
})

describe('DMG gate: which DMGs', () => {
  const layout = { productName: PRODUCT, version: VERSION, arches: ARCHES }

  test('selects exactly the expected DMG for each configured arch, in config order', () => {
    const files = ['/r/Demo-1.2.1-mac-x64.dmg', '/r/Demo-1.2.1-mac-arm64.dmg', '/r/Demo-1.2.1-mac-universal.dmg', '/r/Demo-1.2.1-mac-arm64.dmg.blockmap']
    assert.deepEqual(mac.selectDmgArtifacts(files, layout), ['/r/Demo-1.2.1-mac-universal.dmg', '/r/Demo-1.2.1-mac-arm64.dmg', '/r/Demo-1.2.1-mac-x64.dmg'])
  })

  test('a missing DMG fails before any submission', () => {
    assert.throws(() => mac.selectDmgArtifacts(['/r/Demo-1.2.1-mac-arm64.dmg', '/r/Demo-1.2.1-mac-universal.dmg'], layout), { message: 'missing DMG for x64: Demo-1.2.1-mac-x64.dmg' })
  })

  test('a leftover DMG (another version, another name) fails rather than slipping past', () => {
    const files = ['/r/Demo-1.2.1-mac-x64.dmg', '/r/Demo-1.2.1-mac-arm64.dmg', '/r/Demo-1.2.1-mac-universal.dmg', '/r/Demo-1.2.0-mac-arm64.dmg']
    assert.throws(() => mac.selectDmgArtifacts(files, layout), { message: 'unexpected DMG: Demo-1.2.0-mac-arm64.dmg' })
  })

  test('the app inside a mounted DMG is looked up by the product name', () => {
    const mountPoint = buildOutput([])
    fs.mkdirSync(path.join(mountPoint, `${PRODUCT}.app`))
    assert.equal(mac.findMountedApp(mountPoint, PRODUCT), path.join(mountPoint, `${PRODUCT}.app`))
    assert.throws(() => mac.findMountedApp(mountPoint, 'Other'), { message: `no Other.app in the mounted DMG: ${mountPoint}` })
  })
})

// The fixture ZIPs hold `zip for <arch>`; their sha512 (base64, as electron-builder records it) and sizes are
// literals computed with `openssl dgst -sha512 -binary | base64`, independent of the code under test
const ZIP_HASHES = {
  universal: { sha512: '6hZOTHhbK2X+c0E7xRwpMln3F3dRmAPU5Ltmlyb3dr5e5cdA2D+4KUer8/i+cVJ+6Lrll/bVo4Mre9Pywg2udA==', size: 17 },
  arm64: { sha512: 'fAWqClNSK9Zs59XWpIm+5OMRft9t0dQY9C5Lb1PSAPzJcofS1+QxJ15ReSPkOccrtR+ugqYWYD9mJIwhF6XDFA==', size: 13 },
  x64: { sha512: '8LHcHnGrljLe1uk90QzRJPUPMtzM/TUYtjspAsf0cycm/mNp0dBTHzdGiZYib+Umdz/9BiRljkNJtPXFz6DLAw==', size: 11 }
}
const zipEntry = (arch) => ({ url: `${PRODUCT}-${VERSION}-mac-${arch}.zip`, ...ZIP_HASHES[arch] })

/** Update metadata shaped after a real latest-mac.yml written by electron-builder 26.17.0 */
function metadataYaml({ version = VERSION, files = ARCHES.map(zipEntry) } = {}) {
  return [
    `version: ${version}`,
    'files:',
    ...files.flatMap(({ url, sha512, size }) => [`  - url: ${url}`, `    sha512: ${sha512}`, `    size: ${size}`]),
    `path: ${files[0].url}`,
    `sha512: ${files[0].sha512}`,
    "releaseDate: '2026-10-19T02:55:56.093Z'"
  ].join('\n') + '\n'
}

/**
 * A version directory as a release packaging with the ZIP leaves it (the names a real build writes): the build
 * directories, each arch's DMG, ZIP and ZIP blockmap, builder-debug.yml, and the update metadata files in `metadata`.
 * `skipZip` leaves arches without a ZIP; `extra` adds files.
 */
function releaseOutput({ metadata = { 'latest-mac.yml': metadataYaml() }, skipZip = [], extra = {} } = {}) {
  const outputDir = buildOutput(BUILD_SUBDIRS)
  for (const arch of ARCHES) {
    fs.writeFileSync(dmgPath(outputDir, arch), 'dmg')
    if (skipZip.includes(arch)) continue
    fs.writeFileSync(zipPath(outputDir, arch), `zip for ${arch}`)
    fs.writeFileSync(`${zipPath(outputDir, arch)}.blockmap`, 'blockmap')
  }
  for (const [name, text] of Object.entries({ 'builder-debug.yml': 'arm64: {}\n', ...metadata, ...extra })) fs.writeFileSync(path.join(outputDir, name), text)
  return outputDir
}

const ZIP_LAYOUT = { productName: PRODUCT, version: VERSION, arches: ARCHES, zip: true }

describe('the artifact set the DMG gate runs on', () => {
  test('with the ZIP: the DMGs and ZIPs in config order, once the one update metadata file vouches for exactly those ZIPs; nothing is written', () => {
    const outputDir = releaseOutput()
    const before = ARCHES.map((arch) => fs.statSync(zipPath(outputDir, arch)).mtimeMs)
    assert.deepEqual(mac.checkArtifactSet(outputDir, ZIP_LAYOUT), {
      dmgs: ARCHES.map((arch) => dmgPath(outputDir, arch)),
      zips: ARCHES.map((arch) => zipPath(outputDir, arch)),
      metadata: path.join(outputDir, 'latest-mac.yml')
    })
    assert.deepEqual(ARCHES.map((arch) => fs.readFileSync(zipPath(outputDir, arch), 'utf8')), ARCHES.map((arch) => `zip for ${arch}`))
    assert.deepEqual(ARCHES.map((arch) => fs.statSync(zipPath(outputDir, arch)).mtimeMs), before)
  })

  const only = (...arches) => metadataYaml({ files: arches.map(zipEntry) })
  for (const [name, setup, message] of [
    ['a DMG is missing', { extra: {}, removeDmg: 'x64' }, 'missing DMG for x64: Demo-1.2.1-mac-x64.dmg'],
    ['a ZIP is missing', { skipZip: ['x64'], metadata: { 'latest-mac.yml': only('universal', 'arm64') } }, 'missing ZIP for x64: Demo-1.2.1-mac-x64.zip'],
    // electron-builder's default ZIP name puts the arch before "mac" (and drops it for the default arch)
    ['a ZIP under electron-builder\'s default name is left over', { extra: { 'Demo-1.2.1-arm64-mac.zip': 'old' } }, 'unexpected ZIP: Demo-1.2.1-arm64-mac.zip'],
    ['a ZIP of another version is left over', { extra: { 'Demo-1.2.0-mac-arm64.zip': 'old' } }, 'unexpected ZIP: Demo-1.2.0-mac-arm64.zip'],
    ['there is no update metadata', { metadata: {} },
      'no update metadata (*-mac.yml) in <dir>: electron-builder writes it only when a publish provider is configured or detected'],
    // As electron-builder writes them for a formal version with generateUpdatesFilesForAllChannels on a generic provider
    ['there are several update metadata files', { metadata: { 'latest-mac.yml': metadataYaml(), 'alpha-mac.yml': metadataYaml(), 'beta-mac.yml': metadataYaml() } },
      'more than one update metadata file in <dir>: alpha-mac.yml, beta-mac.yml, latest-mac.yml'],
    ['the update metadata is for another version', { metadata: { 'latest-mac.yml': metadataYaml({ version: '1.2.0' }) } },
      'latest-mac.yml is for version 1.2.0, not 1.2.1'],
    // As electron-builder writes it unless dmg.writeUpdateInfo is false
    ['the update metadata lists a DMG', { metadata: { 'latest-mac.yml': metadataYaml({ files: [...ARCHES.map(zipEntry), { url: 'Demo-1.2.1-mac-arm64.dmg', sha512: ZIP_HASHES.arm64.sha512, size: 3 }] }) } },
      'latest-mac.yml lists a file that is not one of this build\'s ZIPs: Demo-1.2.1-mac-arm64.dmg'],
    ['the update metadata leaves a ZIP out', { metadata: { 'latest-mac.yml': only('universal', 'arm64') } }, 'latest-mac.yml does not list Demo-1.2.1-mac-x64.zip'],
    ['the update metadata lists a ZIP twice', { metadata: { 'latest-mac.yml': only('universal', 'arm64', 'x64', 'arm64') } }, 'latest-mac.yml lists Demo-1.2.1-mac-arm64.zip 2 times'],
    ['the update metadata records another size', { metadata: { 'latest-mac.yml': metadataYaml({ files: [zipEntry('universal'), { ...zipEntry('arm64'), size: 14 }, zipEntry('x64')] }) } },
      'latest-mac.yml records size 14 for Demo-1.2.1-mac-arm64.zip, the file has 13 bytes'],
    // The same size, another hash: what a ZIP rewritten after electron-builder hashed it looks like
    ['the update metadata records another sha512', { metadata: { 'latest-mac.yml': metadataYaml({ files: [zipEntry('universal'), { ...zipEntry('arm64'), sha512: ZIP_HASHES.universal.sha512 }, zipEntry('x64')] }) } },
      'latest-mac.yml records another sha512 for Demo-1.2.1-mac-arm64.zip than the file has']
  ]) {
    test(`fails before any submission when ${name}`, () => {
      const outputDir = releaseOutput(setup)
      if (setup.removeDmg) fs.rmSync(dmgPath(outputDir, setup.removeDmg))
      assert.throws(() => mac.checkArtifactSet(outputDir, ZIP_LAYOUT), { message: message.replace('<dir>', outputDir) })
    })
  }

  test('DMG-only: ZIPs and update metadata are not part of the set', () => {
    const outputDir = releaseOutput({ metadata: {}, extra: { [`${PRODUCT}-${VERSION}-arm64-mac.zip`]: 'stray' } })
    assert.deepEqual(mac.checkArtifactSet(outputDir, { ...ZIP_LAYOUT, zip: false }), {
      dmgs: ARCHES.map((arch) => dmgPath(outputDir, arch)),
      zips: [],
      metadata: null
    })
  })
})

describe('DMG gate: signature and Apple results', () => {
  test('accepts a Developer ID Application DMG with the right Team ID and a secure timestamp', () => {
    assert.doesNotThrow(() => mac.assertDmgSignature(DMG_SIGNED, 'TEAM123456'))
  })

  for (const [name, output, message] of [
    ['no Developer ID Application authority', 'Timestamp=Jul 21, 2026 at 16:14:39\nTeamIdentifier=TEAM123456', 'DMG is not signed by a Developer ID Application identity'],
    ['another Team ID', DMG_OTHER_TEAM, 'DMG Team ID does not match: expected TEAM123456'],
    ['the timestamp turned off', 'Authority=Developer ID Application: X (TEAM123456)\nTimestamp=none\nTeamIdentifier=TEAM123456', 'DMG signature has no secure timestamp']
  ]) {
    test(`refuses a DMG with ${name}`, () => {
      assert.throws(() => mac.assertDmgSignature(output, 'TEAM123456'), { message })
    })
  }

  test('an Accepted log must belong to this submission and carry no error', () => {
    assert.deepEqual(mac.parseAcceptedLog(JSON.stringify({ jobId: 'ABC-1', status: 'Accepted', issues: null }), 'abc-1').issues, [])
    assert.throws(() => mac.parseAcceptedLog(JSON.stringify({ jobId: 'other', status: 'Accepted', issues: [] }), 'abc-1'), { message: 'Apple notarization log is for another submission: expected abc-1' })
    assert.throws(() => mac.parseAcceptedLog(JSON.stringify({ jobId: 'abc-1', status: 'Accepted', issues: [{ severity: 'error' }] }), 'abc-1'), { message: 'Apple notarization log has 1 error-level issue(s)' })
  })

  test('a submission must be Accepted with an id, and malformed output never passes', () => {
    assert.equal(mac.parseAcceptedSubmission(JSON.stringify({ id: 'abc', status: 'Accepted' })), 'abc')
    assert.throws(() => mac.parseAcceptedSubmission(JSON.stringify({ id: 'bad', status: 'Invalid' })), { message: 'Apple notarization not accepted: Invalid (submission: bad)' })
    assert.throws(() => mac.parseAcceptedSubmission('{"status":"Accepted"}'), { message: 'Apple notarization response has no submission id' })
    assert.throws(() => mac.parseAcceptedSubmission('service unavailable'), SyntaxError)
  })
})

describe('DMG gate: one DMG', () => {
  const options = (run, extra = {}) => ({
    credentials: { appleId: 'a@example.com', password: 'p', teamId: 'TEAM123456' },
    findApp: (mountPoint) => path.join(mountPoint, `${PRODUCT}.app`),
    makeMountPoint: () => '/tmp/mount point',
    removeMountPoint: () => {},
    run,
    writeError: () => {},
    writeNotaryLog: () => {},
    ...extra
  })

  test('runs verify → submit → log → staple → Gatekeeper → the app inside, then detaches and removes the mount point', () => {
    const { commands, run } = notaryRunner()
    const logs = []
    const removed = []
    const id = mac.notarizeDmg('/r/Demo 1.2.1-mac-arm64.dmg', options(run, {
      writeNotaryLog: (file, contents) => { commands.push('notary-log-kept'); logs.push({ file, contents }) },
      removeMountPoint: (mountPoint) => { commands.push('mount-point-removed'); removed.push(mountPoint) }
    }))
    assert.equal(id, 'id-Demo-1-2-1-mac-arm64-dmg')
    assert.deepEqual(commands.map((c) => c.split(' ').slice(0, 3).join(' ')), [
      'hdiutil verify /r/Demo', 'codesign --verify --verbose=4', 'codesign --display --verbose=4',
      'xcrun notarytool submit', 'xcrun notarytool log', 'notary-log-kept', 'xcrun stapler staple', 'xcrun stapler validate',
      'hdiutil verify /r/Demo', 'spctl --assess --type', 'hdiutil attach -readonly', 'codesign --verify --deep',
      'xcrun stapler validate', 'hdiutil detach /tmp/mount', 'mount-point-removed'
    ])
    assert.ok(commands.includes('xcrun stapler validate /tmp/mount point/Demo.app'))
    // Apple's log is kept unmodified next to the DMG it belongs to
    assert.deepEqual(logs, [{ file: '/r/Demo 1.2.1-mac-arm64.dmg.notary-log.json', contents: JSON.stringify({ jobId: 'id-Demo-1-2-1-mac-arm64-dmg', status: 'Accepted', issues: [] }) }])
    assert.deepEqual(removed, ['/tmp/mount point'])
  })

  test('a DMG without a secure timestamp fails before it is submitted', () => {
    const commands = []
    const run = (command, args) => {
      commands.push(`${command} ${args.slice(0, 2).join(' ')}`)
      if (command === 'codesign' && args[0] === '--display') return { stdout: '', stderr: 'Authority=Developer ID Application: X (TEAM123456)\nTeamIdentifier=TEAM123456' }
      return { stdout: '', stderr: '' }
    }
    assert.throws(() => mac.notarizeDmg('/r/Demo-1.2.1-mac-arm64.dmg', options(run)), { message: 'DMG signature has no secure timestamp' })
    assert.equal(commands.includes('xcrun notarytool submit'), false)
  })

  test('a rejection fetches the log for diagnosis but throws the original error', () => {
    const errors = []
    const { commands, run } = notaryRunner('x64')
    assert.throws(() => mac.notarizeDmg('/r/Demo-1.2.1-mac-x64.dmg', options(run, { writeError: (message) => errors.push(message) })), {
      message: 'Apple notarization not accepted: Invalid (submission: id-Demo-1-2-1-mac-x64-dmg)'
    })
    assert.ok(commands.some((c) => c.startsWith('xcrun notarytool log id-Demo-1-2-1-mac-x64-dmg')))
    // The log body itself reaches the diagnostics
    assert.deepEqual(errors, [JSON.stringify({ jobId: 'id-Demo-1-2-1-mac-x64-dmg', status: 'Accepted', issues: [] })])
  })

  test('a failure inside the mounted image still detaches (forcing if needed), and cleanup never hides the cause', () => {
    const commands = []
    let removed = false
    const { run: inner } = notaryRunner()
    const run = (command, args) => {
      commands.push(`${command} ${args.join(' ')}`)
      if (command === 'codesign' && args.includes('--deep')) throw new Error('codesign failed')
      if (command === 'hdiutil' && args[0] === 'detach' && args[1] !== '-force') throw new Error('device busy')
      return inner(command, args)
    }
    assert.throws(() => mac.notarizeDmg('/r/Demo-1.2.1-mac-universal.dmg', options(run, { removeMountPoint: () => { removed = true } })), { message: 'codesign failed' })
    assert.ok(commands.includes('hdiutil detach -force /tmp/mount point'))
    assert.equal(removed, true)
  })
})

describe('command line', () => {
  test('an unknown subcommand prints the usage', () => {
    assert.throws(() => mac.main(['dmg']), { message: 'usage: node <path>/mac-packaging.cjs <local|release|notarize-dmg>' })
  })

  test('outside the project root it says so instead of guessing', () => {
    const elsewhere = tempDir()
    assert.throws(() => mac.main(['local'], {}, elsewhere), { message: `run from the project root: no electron-builder.yml in ${elsewhere}` })
  })

  test('the DMG gate checks the artifact set before running any command', () => {
    // Were any DMG gated first, the real hdiutil would fail on the fixture's fake DMG with another error
    const root = tempDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: VERSION }))
    fs.writeFileSync(path.join(root, 'electron-builder.yml'), mac.yamlParser().dump(ZIP_CONFIG))
    const outputDir = path.join(root, 'release', VERSION)
    fs.mkdirSync(path.dirname(outputDir))
    fs.renameSync(releaseOutput({ metadata: {} }), outputDir)
    assert.throws(() => mac.main(['notarize-dmg'], APPLE_ENV, root), {
      message: `no update metadata (*-mac.yml) in ${outputDir}: electron-builder writes it only when a publish provider is configured or detected`
    })
  })
})

describe('the launch inputs a packaged app must refuse', () => {
  const APPS = [{ arch: 'arm64', app: '/out/mac-arm64/Demo.app' }]
  const check = (launch, { apps = APPS, hostArch = 'arm64', env = {}, log = () => {} } = {}) =>
    mac.checkLaunchInputs(apps, { productName: PRODUCT, env, launch, hostArch, log })
  /** What a launch was given, with its settings directory and the generated program shown by role */
  const given = ({ args, env }) => ({
    args: args
      .filter((arg) => !arg.startsWith('--user-data-dir='))
      .map((arg) => arg.replace(/=.*launch-program$/, '=<program>')),
    url: env.ELECTRON_RENDERER_URL
  })

  test('every input is tried on the app, each launch with its own settings directory, and then a plain launch', () => {
    const { calls, launch } = launcher()
    check(launch)
    assert.deepEqual(calls.map(given), [
      { args: ['--remote-debugging-port=0'], url: undefined },
      { args: ['-remote-debugging-port=0'], url: undefined },
      { args: [' --remote-debugging-port=0'], url: undefined },
      { args: ['--remote-debugging-pipe'], url: undefined },
      { args: ['--type='], url: undefined },
      { args: ['--gpu-launcher=<program>'], url: undefined },
      { args: ['--renderer-cmd-prefix=<program>'], url: undefined },
      { args: ['--utility-cmd-prefix=<program>'], url: undefined },
      { args: ['--mac-packaging-probe-unknown-switch'], url: undefined },
      { args: [], url: 'http://127.0.0.1:9/' },
      { args: [], url: undefined }
    ])
    assert.ok(calls.every(({ binary }) => binary === path.join('/out/mac-arm64/Demo.app', 'Contents', 'MacOS', PRODUCT)))
    const dirs = calls.map(({ args }) => args.find((arg) => arg.startsWith('--user-data-dir=')))
    assert.ok(dirs.every(Boolean), 'every launch names a settings directory, so none touches the real one')
    assert.equal(new Set(dirs).size, calls.length)
    // A guard that skips the first argument must not pass by finding the settings directory there
    for (const { args } of calls) assert.ok(args.at(-1).startsWith('--user-data-dir='), args.join(' '))
  })

  test('the app is given only a small environment, never the signing and Apple secrets', () => {
    const { calls, launch } = launcher()
    check(launch, { env: { HOME: '/h', PATH: '/p', CSC_LINK: 'secret', CSC_KEY_PASSWORD: 'secret', APPLE_ID: 'secret', APPLE_APP_SPECIFIC_PASSWORD: 'secret', APPLE_TEAM_ID: 'secret', ELECTRON_RENDERER_URL: 'http://left.over/' } })
    assert.ok(!JSON.stringify(calls.map(({ env }) => env)).includes('secret'))
    assert.deepEqual(calls.at(-1).env, { HOME: '/h', PATH: '/p' }, 'the plain launch inherits no refused variable')
  })

  test('a switch after a space that the app does not refuse fails the packaging, named so', () => {
    const { launch } = launcher(({ args }) => (args[0] === ' --remote-debugging-port=0' ? { exited: false } : undefined))
    assert.throws(() => check(launch), { message: /Demo\.app did not refuse --remote-debugging-port after a space: it was still running at the limit/ })
  })

  test('an app still running at the limit fails the packaging, naming the input', () => {
    const { calls, launch } = launcher(({ args }) => (args.some((arg) => arg === '--remote-debugging-pipe') ? { exited: false } : undefined))
    assert.throws(() => check(launch), { message: /Demo\.app did not refuse --remote-debugging-pipe: it was still running at the limit/ })
    assert.equal(calls.length, 4, 'the first input it does not refuse ends the check')
    assert.equal(calls.at(-1).args[0], '--remote-debugging-pipe')
  })

  for (const [name, result, shown] of [
    ['exits 0', { exited: true, status: 0, signal: null }, 'it exited with code 0'],
    ['exits 1', { exited: true, status: 1, signal: null }, 'it exited with code 1'],
    ['crashes', { exited: true, status: null, signal: 'SIGTRAP' }, 'it ended on SIGTRAP']
  ]) {
    test(`an app that ${name} on an input has not refused it`, () => {
      const { launch } = launcher(({ args }) => (args[0] === '--remote-debugging-port=0' ? result : undefined))
      assert.throws(() => check(launch), (error) => {
        assert.match(error.message, /did not refuse --remote-debugging-port/)
        assert.ok(error.message.includes(shown), error.message)
        assert.match(error.message, /exit code 64/)
        return true
      })
    })
  }

  test('a program named on the command line that ran fails the packaging, even when the app then exits 64', () => {
    // The real generated program, run the way a launcher prefix is: it records that it ran, then does what it is asked
    let ran = null
    const { launch } = launcher(({ args }) => {
      const named = args.find((arg) => arg.startsWith('--gpu-launcher='))
      if (named) ran = spawnSync(named.slice('--gpu-launcher='.length), ['/bin/sh', '-c', 'exit 7'])
      return undefined
    })
    assert.throws(() => check(launch), { message: /Demo\.app ran the program named by --gpu-launcher/ })
    assert.equal(ran.status, 7, 'the program goes on to run what it is given')
  })

  for (const [name, result, shown] of [
    ['refuses it', { exited: true, status: 64, signal: null }, 'it exited with code 64'],
    ['exits by itself', { exited: true, status: 0, signal: null }, 'it exited with code 0'],
    ['crashes', { exited: true, status: null, signal: 'SIGSEGV' }, 'it ended on SIGSEGV']
  ]) {
    test(`an app that ${name} on a plain launch fails the packaging: refusing everything would pass every input`, () => {
      const { launch } = launcher(({ args, env }) => (isPlainLaunch(args, env) ? result : undefined))
      assert.throws(() => check(launch), (error) => {
        assert.match(error.message, /Demo\.app did not stay up on a launch with only its settings directory/)
        assert.ok(error.message.includes(shown), error.message)
        return true
      })
    })
  }

  for (const [outcome, answer, message] of [
    ['passed', () => undefined, null],
    ['failed', () => ({ exited: false }), /did not refuse/]
  ]) {
    test(`a temporary directory that cannot be fully removed leaves the outcome of a check that ${outcome} as it is`, () => {
      let locked = null
      const { launch } = launcher(({ args }) => {
        if (!locked) {
          // A read-only directory with a file in it, which makes removing the temporary directory throw
          locked = path.join(args.at(-1).slice('--user-data-dir='.length), 'locked')
          fs.mkdirSync(locked)
          fs.writeFileSync(path.join(locked, 'file'), '')
          fs.chmodSync(locked, 0o555)
        }
        return answer()
      })
      try {
        if (message) assert.throws(() => check(launch), { message })
        else check(launch)
        // The removal did fail, so the case exercised what it is named for
        assert.equal(fs.existsSync(locked), true)
      } finally {
        fs.chmodSync(locked, 0o755)
        fs.rmSync(path.dirname(path.dirname(locked)), { recursive: true, force: true })
      }
    })
  }

  test('the check waits longer for a refusal than it watches a plain launch', () => {
    const { calls, launch } = launcher()
    check(launch)
    const refusal = calls[0].limit
    const plain = calls.at(-1).limit
    assert.ok(refusal > plain && plain > 0, `refusal ${refusal}, plain ${plain}`)
  })

  test('an app this machine cannot run is reported and left out; a universal one runs anywhere', () => {
    const { calls, launch } = launcher()
    const lines = []
    check(launch, {
      apps: [{ arch: 'x64', app: '/out/mac/Demo.app' }, { arch: 'universal', app: '/out/mac-universal/Demo.app' }],
      hostArch: 'arm64',
      log: (line) => lines.push(line)
    })
    assert.ok(calls.every(({ binary }) => binary.startsWith('/out/mac-universal/')))
    assert.ok(calls.length > 0)
    assert.ok(lines.some((line) => line.includes('/out/mac/Demo.app') && line.includes('x64') && line.includes('arm64')), lines.join('\n'))
  })

  test('no app this machine can run fails the packaging rather than passing unchecked', () => {
    const { calls, launch } = launcher()
    assert.throws(() => check(launch, { apps: [{ arch: 'x64', app: '/out/mac/Demo.app' }], hostArch: 'arm64' }), {
      message: 'none of the built apps can run on this machine (arm64), so none could be checked for the launch inputs it must refuse'
    })
    assert.equal(calls.length, 0)
  })

  test('the temporary directories are removed whether the check passes or fails', () => {
    const seen = new Set()
    const record = ({ args }) => {
      const dir = args.find((arg) => arg.startsWith('--user-data-dir='))
      seen.add(path.dirname(dir.slice('--user-data-dir='.length)))
      return undefined
    }
    check(launcher(record).launch)
    assert.throws(() => check(launcher((call) => (record(call), { exited: false })).launch))
    assert.equal(seen.size, 2)
    for (const dir of seen) assert.equal(fs.existsSync(dir), false, dir)
  })

  for (const [profile, env] of [['local', { CSC_LINK: 'base64-p12' }], ['release', { CSC_LINK: 'base64-p12', ...APPLE_ENV }]]) {
    test(`a ${profile} packaging runs the check on the app it built, and an app that fails it stops the packaging before the DMG checks`, () => {
      const outputDir = tempDir()
      const { commands, run } = buildRunner(outputDir)
      const passing = launcher()
      pkg(outputDir, run, profile, env, false, passing.launch)
      const launched = new Set(passing.calls.map(({ binary }) => /\/(mac[^/]*)\/Demo\.app\//.exec(binary)[1]))
      assert.deepEqual([...launched].sort(), ['mac-arm64', 'mac-universal'], 'every app an arm64 machine can run, and only those')
      assert.equal(passing.calls.length, 2 * 11, 'each of them gets all ten inputs and the plain launch')

      const failedDir = tempDir()
      const failed = buildRunner(failedDir)
      assert.throws(() => pkg(failedDir, failed.run, profile, env, false, launcher(() => ({ exited: false })).launch), /did not refuse/)
      assert.ok(!failed.commands.some((command) => command.startsWith('codesign --verify') && command.endsWith('.dmg')), failed.commands.join('\n'))
      assert.ok(commands.some((command) => command.startsWith('codesign --verify') && command.endsWith('.dmg')))
    })
  }
})

describe('starting a real process for the launch gate', () => {
  function script(body) {
    const file = path.join(tempDir(), 'app')
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    return file
  }

  test('a process that exits reports its code', () => {
    assert.deepEqual(mac.launchApp(script('exit 64'), [], {}, 5000), { exited: true, status: 64, signal: null })
  })

  test('a process still running at the limit is killed and reported as not exited', () => {
    const started = Date.now()
    assert.deepEqual(mac.launchApp(script('exec sleep 30'), [], {}, 300), { exited: false })
    assert.ok(Date.now() - started < 10_000)
  })

  test('a process that dies on a signal reports the signal', () => {
    assert.deepEqual(mac.launchApp(script('kill -TRAP $$'), [], {}, 5000), { exited: true, status: null, signal: 'SIGTRAP' })
  })

  test('it passes the arguments and the environment it is given', () => {
    assert.deepEqual(mac.launchApp(script('[ "$1" = "--a=b" ] && [ "$PROBE" = "yes" ] && exit 64; exit 3'), ['--a=b'], { PROBE: 'yes' }, 5000), { exited: true, status: 64, signal: null })
  })

  test('a binary that cannot start is an error, not a result', () => {
    assert.throws(() => mac.launchApp('/no/such/binary', [], {}, 1000), /\/no\/such\/binary could not start/)
  })
})
