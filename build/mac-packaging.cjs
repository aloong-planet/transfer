#!/usr/bin/env node
// macOS Developer ID packaging for electron-builder projects (electron-scaffold's macos-signing.md, section 3).
//
//   node build/mac-packaging.cjs local          one builder call: sign every arch's .app and DMG (and zip the app when
//                                               configured), never notarize
//   node build/mac-packaging.cjs release        the same call plus this file as the afterSign hook, which notarizes
//                                               and staples each .app before its DMG and ZIP are built
//   node build/mac-packaging.cjs notarize-dmg   the DMG gate: check the artifact set, then notarize, staple and verify
//                                               every DMG
//
// Run from the project root through the package scripts: the build calls electron-vite and electron-builder by
// name, which resolve from node_modules/.bin only there. Requirements in electron-builder.yml, all checked at run
// time before building: a mac `dmg` target with an arch list, `directories.output` using at most `${version}`,
// `mac.notarize: false`, `dmg.sign: true` and `dmg.artifactName: ${productName}-${version}-mac-${arch}.dmg`.
//
// The ZIP electron-updater installs from is opted into by a mac `zip` target with the same arch list as the dmg
// target; without one, only DMGs are built and gated. With it, electron-builder.yml must also set
// `mac.artifactName: ${productName}-${version}-mac-${arch}.${ext}` (the ZIP's name: electron-builder takes no
// zip-specific options) and `dmg.writeUpdateInfo: false` (the DMG gate staples each DMG after electron-builder hashed
// it, so the update metadata may list only the ZIPs), and a publish provider must be configured or detectable (a
// GitHub repository is): without one electron-builder writes no update metadata (`<channel>-mac.yml`). Nothing
// writes the ZIP after the build: the metadata records its size and sha512, which the DMG gate checks first.
//
// The release profile and the DMG gate read APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID; the
// certificate comes from the login keychain or, in CI, from CSC_LINK. The YAML parser is the js-yaml that
// electron-builder itself depends on.
//
// Both profiles launch the built app and require it to refuse launch inputs with exit code 64 (macos-signing.md,
// section 6; electron-security.md, item 21). The app must implement that refusal: this file only checks it.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const KNOWN_ARCHES = ['arm64', 'x64', 'universal']
const DMG_ARTIFACT_NAME = '${productName}-${version}-mac-${arch}.dmg'
// electron-builder takes no zip-specific options, so the ZIP is named by the mac-wide pattern
const ZIP_ARTIFACT_NAME = '${productName}-${version}-mac-${arch}.${ext}'

/**
 * The js-yaml electron-builder depends on, resolved through electron-builder's own dependency tree so the project
 * needs no YAML parser of its own. `resolve` is injectable for tests.
 */
function yamlParser(resolve = require.resolve) {
  try {
    const builderLib = path.dirname(resolve('app-builder-lib/package.json', { paths: [path.dirname(resolve('electron-builder/package.json'))] }))
    return require(resolve('js-yaml', { paths: [builderLib] }))
  } catch (error) {
    throw new Error(
      'cannot load js-yaml through electron-builder (electron-builder → app-builder-lib → js-yaml); ' +
        `is electron-builder installed? (${error instanceof Error ? error.message : String(error)})`,
      { cause: error }
    )
  }
}

/** The architectures of the macOS DMG target in electron-builder.yml, in config order. */
function configuredArches(config) {
  const targets = config?.mac?.target ?? []
  const dmg = Array.isArray(targets) ? targets.find((entry) => entry?.target === 'dmg') : null
  const arches = dmg?.arch ?? []
  if (arches.length === 0) throw new Error('electron-builder.yml has no mac dmg target with an arch list')
  const unknown = arches.filter((arch) => !KNOWN_ARCHES.includes(arch))
  if (unknown.length > 0) throw new Error(`unsupported mac arch in electron-builder.yml: ${unknown.join(', ')}`)
  if (new Set(arches).size !== arches.length) throw new Error('electron-builder.yml lists a mac arch twice')
  return arches
}

/**
 * Product name, version, versioned output directory (relative to the project root) and arches, from the parsed
 * electron-builder.yml and package.json text. The DMG naming is required, not reproduced: electron-builder's
 * default pattern drops the arch for the default architecture, so a file name could not be mapped back to its arch.
 */
function resolveLayout(config, packageJsonText) {
  const { version } = JSON.parse(packageJsonText)
  const output = config?.directories?.output
  if (typeof output !== 'string') throw new Error('electron-builder.yml has no directories.output')
  const outputDir = output.split('${version}').join(version)
  if (outputDir.includes('${')) throw new Error(`directories.output may only use \${version}: ${output}`)
  if (config?.dmg?.artifactName !== DMG_ARTIFACT_NAME) {
    throw new Error(`electron-builder.yml must set dmg.artifactName: ${DMG_ARTIFACT_NAME} (found: ${config?.dmg?.artifactName ?? 'nothing'})`)
  }
  // electron-builder leaves the DMG unsigned without it, which the signature check would only find after the build
  if (config.dmg.sign !== true) throw new Error(`electron-builder.yml must set dmg.sign: true (found: ${config.dmg.sign ?? 'nothing'})`)
  if (typeof config.productName !== 'string' || config.productName === '') throw new Error('electron-builder.yml has no productName')
  const arches = configuredArches(config)
  const zip = zipConfigured(config, arches)
  if (zip && config.mac.artifactName !== ZIP_ARTIFACT_NAME) {
    throw new Error(`with the zip target, electron-builder.yml must set mac.artifactName: ${ZIP_ARTIFACT_NAME} (found: ${config.mac.artifactName ?? 'nothing'})`)
  }
  // The DMG gate staples each DMG after electron-builder hashed it, so the update metadata may list only the ZIPs
  if (zip && config.dmg.writeUpdateInfo !== false) {
    throw new Error(`with the zip target, electron-builder.yml must set dmg.writeUpdateInfo: false (found: ${config.dmg.writeUpdateInfo ?? 'nothing'})`)
  }
  return { productName: config.productName, version, outputDir, arches, zip }
}

/**
 * Whether the mac targets include a ZIP, the archive electron-updater installs from. Any zip target counts, so a ZIP
 * is never built without being gated, and it must cover exactly the DMG's arches: the same app ships in both.
 */
function zipConfigured(config, arches) {
  const zip = config.mac.target.find((entry) => entry === 'zip' || entry?.target === 'zip')
  if (zip === undefined) return false
  const zipArches = Array.isArray(zip?.arch) ? zip.arch : []
  if ([...zipArches].sort().join(' ') !== [...arches].sort().join(' ')) {
    const found = zipArches.length > 0 ? zipArches.join(', ') : 'no arch list'
    throw new Error(`the mac zip target must list the same arches as the dmg target: ${arches.join(', ')} (found: ${found})`)
  }
  return true
}

/** The valid "Developer ID Application" identities in `security find-identity -v -p codesigning` output. */
function developerIdIdentities(output) {
  return [...output.matchAll(/^\s*\d+\) [0-9A-F]{40} "(Developer ID Application: [^"]+)"$/gm)].map((m) => m[1])
}

/**
 * Where the Developer ID certificate comes from, or an error when there is none (no unsigned build exists).
 * CI provides CSC_LINK, which electron-builder imports into a temporary keychain itself, so it is not in the
 * login keychain yet. Locally the identity must already be in the keychain. -v lists only valid identities, as
 * electron-builder's own lookup does, so an identity with a broken trust chain counts as missing.
 */
function certificateSource(env, run) {
  if (env.CSC_LINK && env.CSC_LINK.trim() !== '') return 'CSC_LINK'
  const listing = run('security', ['find-identity', '-v', '-p', 'codesigning'])
  const found = developerIdIdentities(listing.stdout)
  if (found.length === 0) {
    throw new Error(
      'no valid "Developer ID Application" signing identity in the keychain, and CSC_LINK is not set.\n' +
        'Every macOS package is signed with it: install the certificate (locally) or configure the CSC_LINK secret (CI).\n' +
        'To also list identities that are present but not trusted (for example a missing intermediate certificate):\n' +
        '  security find-identity -v'
    )
  }
  return `keychain: ${found[0]}`
}

function readCredentials(env) {
  const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
  const missing = required.filter((name) => !env[name])
  if (missing.length > 0) throw new Error(`missing Apple notarization credentials: ${missing.join(', ')}`)
  return { appleId: env.APPLE_ID, password: env.APPLE_APP_SPECIFIC_PASSWORD, teamId: env.APPLE_TEAM_ID }
}

/** `lipo -archs` output → the electron-builder arch name */
function archFromLipo(output) {
  const found = output.trim().split(/\s+/).sort().join(' ')
  if (found === 'arm64') return 'arm64'
  if (found === 'x86_64') return 'x64'
  if (found === 'arm64 x86_64') return 'universal'
  throw new Error(`unexpected binary architectures: ${output.trim() || '(none)'}`)
}

/** The arch of one built app, read from its main binary */
function appArch(app, productName, run) {
  return archFromLipo(run('lipo', ['-archs', path.join(app, 'Contents', 'MacOS', productName)]).stdout)
}

/**
 * The built `<productName>.app` for every configured arch, in config order.
 *
 * Located from the build output rather than from guessed paths: x64 builds into `mac/` and the other
 * architectures into `mac-<arch>/`. Each app's arch is read from its main binary, and the set must match the
 * config exactly, so a missing, duplicated or leftover app fails here instead of being shipped.
 */
function findBuiltApps({ outputDir, productName, arches, run }) {
  const candidates = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (entry.name === 'mac' || entry.name.startsWith('mac-')))
      .map((entry) => path.join(outputDir, entry.name, `${productName}.app`))
      .filter((app) => fs.existsSync(app))
    : []
  if (candidates.length === 0) {
    throw new Error(`no built ${productName}.app under ${outputDir}; the build produced nothing`)
  }

  const byArch = new Map()
  for (const app of candidates) {
    const arch = appArch(app, productName, run)
    if (!arches.includes(arch)) throw new Error(`built app for an arch the config does not list (${arch}): ${app}`)
    if (byArch.has(arch)) throw new Error(`two built apps for ${arch}: ${byArch.get(arch)} and ${app}`)
    byArch.set(arch, app)
  }
  const missing = arches.filter((arch) => !byArch.has(arch))
  if (missing.length > 0) throw new Error(`no built app for ${missing.join(', ')} under ${outputDir}`)
  return arches.map((arch) => ({ arch, app: byArch.get(arch) }))
}

/**
 * Fails unless `codesign --display` output names a Developer ID Application authority. electron-builder skips
 * signing without an error when it finds no identity, so a build is never trusted to have signed.
 */
function assertDeveloperIdSigned(output, app) {
  const lines = output.split(/\r?\n/)
  if (!lines.some((line) => line.startsWith('Authority=Developer ID Application:'))) {
    throw new Error(`not signed with a Developer ID Application identity: ${app}`)
  }
}

/** The TeamIdentifier field of `codesign --display` output */
function teamIdentifier(output) {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith('TeamIdentifier='))
  return line ? line.slice('TeamIdentifier='.length).trim() : null
}

/** A signature as distribution needs it: Developer ID Application authority, the expected Team ID, a secure timestamp */
function assertSignature(output, teamId, label) {
  const lines = output.split(/\r?\n/)
  if (!lines.some((line) => line.startsWith('Authority=Developer ID Application:'))) {
    throw new Error(`${label} is not signed by a Developer ID Application identity`)
  }
  if (!lines.includes(`TeamIdentifier=${teamId}`)) {
    throw new Error(`${label} Team ID does not match: expected ${teamId}`)
  }
  if (!lines.some((line) => line.startsWith('Timestamp=') && !['', 'none'].includes(line.slice('Timestamp='.length).trim().toLowerCase()))) {
    throw new Error(`${label} signature has no secure timestamp`)
  }
}

/** A DMG's signature, as `assertSignature` checks it */
function assertDmgSignature(output, teamId) {
  assertSignature(output, teamId, 'DMG')
}

/** The notarization log kept next to the version's artifacts for one arch's app */
function appNotaryLogFile(outputDir, productName, version, arch) {
  return path.join(outputDir, `${productName}-${version}-mac-${arch}.app.notary-log.json`)
}

/** The DMG electron-builder writes for one arch, given the required dmg.artifactName */
function dmgFile(outputDir, productName, version, arch) {
  return path.join(outputDir, `${productName}-${version}-mac-${arch}.dmg`)
}

/** The ZIP electron-builder writes for one arch, given the required mac.artifactName */
function zipFile(outputDir, productName, version, arch) {
  return path.join(outputDir, `${productName}-${version}-mac-${arch}.zip`)
}

/**
 * Whether a file name is electron-builder's macOS update metadata, `<channel>-mac.yml`. The channel follows the publish
 * provider and the version (a GitHub provider writes `latest-mac.yml` for every version), so only the suffix is fixed.
 */
function isUpdateMetadata(name) {
  return name.endsWith('-mac.yml')
}

/**
 * The ZIP's acceptance. The ZIP carries no ticket of its own and must never be written (the update metadata records
 * its hash), so the app inside is checked in a temporary extraction, removed afterwards.
 */
function checkZippedApp(file, { productName, teamId, stapled, run }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-zip-'))
  try {
    run('ditto', ['-x', '-k', file, dir])
    // The ZIP must hold exactly the app: extraDistFiles in the config would put files beside it
    const entries = fs.readdirSync(dir).sort()
    if (entries.length !== 1 || entries[0] !== `${productName}.app`) {
      throw new Error(`${path.basename(file)} must hold exactly ${productName}.app (found: ${entries.join(', ') || 'nothing'})`)
    }
    const app = path.join(dir, `${productName}.app`)
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
    const display = run('codesign', ['--display', '--verbose=4', app])
    assertSignature([display.stdout, display.stderr].join('\n'), teamId, `${path.basename(file)}'s app`)
    // In release the app must carry its own ticket, as the DMG's app does
    if (stapled) run('xcrun', ['stapler', 'validate', app])
  } finally {
    // A removal that fails (a read-only directory in the bundle makes it throw) must neither fail a check that
    // passed nor replace the error of one that failed; it only leaves a temporary directory behind
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`[mac] could not remove the temporary extraction ${dir}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/** The exit code a packaged app refuses a launch input with, the contract between the app and this gate (EX_USAGE) */
const REFUSED_EXIT_CODE = 64
// The system's checks on a freshly signed app can take seconds on its first launch; the refusal itself is immediate
const REFUSAL_LIMIT_MS = 30_000
const PLAIN_LAUNCH_MS = 8_000
// What a launched app is given of the environment, so the certificate and the Apple credentials never reach it
const LAUNCH_ENV = ['HOME', 'PATH', 'TMPDIR', 'USER', 'LOGNAME', 'LANG']

/**
 * The inputs tried. The switches are the ones measured to open the debugging port or to run a program on a notarized
 * build (or to crash it), and a made-up one that only an allow-list refuses, since Chromium's switches are no fixed list.
 * An empty --type reaches the main process as any other launch does; with a process type's name, --type never reaches it,
 * because Chromium reads that first, and a build started that way by hand crashes with or without a guard, so it is not
 * tried. The variable is the URL the common Electron templates load in development; a project's own test seams are its
 * own unit tests' to cover.
 */
function launchInputs(program) {
  const named = (input) => ({ name: input.split('=')[0], args: [input] })
  return [
    named('--remote-debugging-port=0'),
    named('-remote-debugging-port=0'),
    named('--remote-debugging-pipe'),
    named('--type='),
    named(`--gpu-launcher=${program}`),
    named(`--renderer-cmd-prefix=${program}`),
    named(`--utility-cmd-prefix=${program}`),
    named('--mac-packaging-probe-unknown-switch'),
    { name: 'ELECTRON_RENDERER_URL', args: [], env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:9/' } }
  ]
}

/** How a launch ended, in words */
function launchOutcome(result) {
  if (!result.exited) return 'it was still running at the limit'
  return result.signal ? `it ended on ${result.signal}` : `it exited with code ${result.status}`
}

/**
 * One launch of a real process, bounded: it is killed at the limit. Its output is not read: the exit is the answer, and
 * an app left running with a pipe open would hold the call past the limit.
 */
function launchApp(binary, args, env, limit) {
  const result = spawnSync(binary, args, { env, timeout: limit, killSignal: 'SIGKILL', stdio: 'ignore' })
  if (result.error && result.error.code !== 'ETIMEDOUT') throw new Error(`${binary} could not start: ${result.error.message}`)
  if (result.error) return { exited: false }
  return { exited: true, status: result.status, signal: result.signal }
}

/**
 * Launches each app this machine can run with each input it must refuse, then with only its settings directory. The
 * plain launch is what makes a pass mean something: an app that refuses everything would pass every input, and no user
 * could open it. Every launch has its own settings directory, so none touches the real one or meets a running copy's
 * single-instance lock.
 */
function checkLaunchInputs(apps, { productName, env = process.env, launch = launchApp, hostArch = process.arch, log = console.log }) {
  const runnable = apps.filter(({ arch }) => arch === 'universal' || arch === hostArch)
  for (const { arch, app } of apps) {
    if (!runnable.some((entry) => entry.app === app)) log(`[mac] not launching ${app}: it is ${arch} and this machine is ${hostArch}`)
  }
  if (runnable.length === 0) {
    throw new Error(`none of the built apps can run on this machine (${hostArch}), so none could be checked for the launch inputs it must refuse`)
  }
  const inherited = Object.fromEntries(LAUNCH_ENV.filter((name) => env[name] !== undefined).map((name) => [name, env[name]]))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-launch-'))
  try {
    const program = path.join(dir, 'launch-program')
    const ran = `${program}.ran`
    fs.writeFileSync(program, `#!/bin/sh\n: > '${ran}'\nexec "$@"\n`, { mode: 0o755 })
    let launches = 0
    const settings = () => {
      const settingsDir = path.join(dir, `settings-${++launches}`)
      fs.mkdirSync(settingsDir)
      return `--user-data-dir=${settingsDir}`
    }
    for (const { app } of runnable) {
      const binary = path.join(app, 'Contents', 'MacOS', productName)
      for (const input of launchInputs(program)) {
        // The input comes first: a guard that skips the first argument must not pass by finding the settings directory there
        const result = launch(binary, [...input.args, settings()], { ...inherited, ...input.env }, REFUSAL_LIMIT_MS)
        if (fs.existsSync(ran)) throw new Error(`${productName}.app ran the program named by ${input.name}`)
        if (!result.exited || result.signal || result.status !== REFUSED_EXIT_CODE) {
          throw new Error(
            `${productName}.app did not refuse ${input.name}: ${launchOutcome(result)}. ` +
              `A packaged app must exit with exit code ${REFUSED_EXIT_CODE} before it loads anything when a launch carries this input.`
          )
        }
      }
      const plain = launch(binary, [settings()], inherited, PLAIN_LAUNCH_MS)
      if (plain.exited) {
        throw new Error(`${productName}.app did not stay up on a launch with only its settings directory: ${launchOutcome(plain)}`)
      }
      log(`[mac] ${app} refuses every launch input tried and stays up on a plain launch`)
    }
  } finally {
    // As with the ZIP's extraction: a failed removal neither fails a check that passed nor replaces the error of one that failed
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`[mac] could not remove the temporary directory ${dir}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function parseAcceptedSubmission(stdout) {
  const result = JSON.parse(stdout)
  if (result.status !== 'Accepted') {
    const submission = result.id ? ` (submission: ${result.id})` : ''
    throw new Error(`Apple notarization not accepted: ${result.status ?? 'unknown status'}${submission}`)
  }
  if (typeof result.id !== 'string' || result.id.length === 0) {
    throw new Error('Apple notarization response has no submission id')
  }
  return result.id
}

function parseAcceptedLog(stdout, submissionId) {
  const result = JSON.parse(stdout)
  if (typeof result.jobId !== 'string' || result.jobId.toLowerCase() !== submissionId.toLowerCase()) {
    throw new Error(`Apple notarization log is for another submission: expected ${submissionId}`)
  }
  if (result.status !== 'Accepted') {
    throw new Error(`Apple notarization log status is not Accepted: ${result.status ?? 'unknown status'}`)
  }
  const issues = Array.isArray(result.issues) ? result.issues : []
  const errors = issues.filter((issue) => issue?.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Apple notarization log has ${errors.length} error-level issue(s)`)
  }
  return { ...result, issues }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} failed (exit ${result.status})${output ? `\n${output}` : ''}`)
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/**
 * Submits one file to Apple and waits; returns the submission id and its Accepted log (raw JSON). A rejection
 * fetches the log for diagnosis, but a failure to fetch it never replaces the original error.
 */
function submitForNotarization(file, { credentials, run, writeError }) {
  const auth = ['--apple-id', credentials.appleId, '--password', credentials.password, '--team-id', credentials.teamId]
  const submission = run('xcrun', ['notarytool', 'submit', file, ...auth, '--wait', '--output-format', 'json'])
  let submissionId
  try {
    submissionId = parseAcceptedSubmission(submission.stdout)
  } catch (error) {
    let rejectedId = null
    try {
      rejectedId = JSON.parse(submission.stdout).id ?? null
    } catch {
      // A malformed response has no submission id to fetch a log for; the parse error stands.
    }
    if (rejectedId) {
      try {
        const log = run('xcrun', ['notarytool', 'log', rejectedId, ...auth, '--output-format', 'json'])
        writeError(log.stdout || log.stderr)
      } catch {
        // The log is diagnostics only; failing to fetch it must not replace the rejection.
      }
    }
    throw error
  }
  const acceptedLog = run('xcrun', ['notarytool', 'log', submissionId, ...auth, '--output-format', 'json'])
  parseAcceptedLog(acceptedLog.stdout, submissionId)
  return { submissionId, log: acceptedLog.stdout }
}

/**
 * One electron-builder call builds and signs every configured arch's .app and DMG, the way the builder is meant to
 * be used, so everything it does inside a single build (app-update.yml, for one) still happens. Built-in
 * notarization stays off; the release profile notarizes each .app through the afterSign hook instead, after signing
 * and before that arch's DMG is built. Signatures, and in release the stapled tickets, are confirmed on the result.
 */
function packageMac({ profile, env, run, outputDir, productName, version, arches, zip = false, hookPath, launch = launchApp, hostArch = process.arch, log = console.log }) {
  if (profile !== 'local' && profile !== 'release') throw new Error(`unknown profile: ${profile}`)
  const release = profile === 'release'
  // Both checks come before the build: the hook would otherwise fail only after minutes of packing
  if (release) readCredentials(env)
  certificateSource(env, run)

  // Anything an earlier run left must not pass for this run's output: the builder could fail to write a DMG
  // without an error, a local package must never sit next to a log claiming it was notarized, and a leftover
  // app (a crashed universal build leaves <outDir>-<arch>-temp) must be gone before the hook submits anything.
  // Only this build's own mac/ and mac-*/ outputs are cleared; Mac App Store output (mas-*) is left alone
  if (fs.existsSync(outputDir)) {
    for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
      if (entry.isDirectory() && (entry.name === 'mac' || entry.name.startsWith('mac-'))) {
        fs.rmSync(path.join(outputDir, entry.name), { recursive: true, force: true })
      }
    }
  }
  for (const arch of arches) {
    const dmg = dmgFile(outputDir, productName, version, arch)
    fs.rmSync(appNotaryLogFile(outputDir, productName, version, arch), { force: true })
    fs.rmSync(dmg, { force: true })
    fs.rmSync(`${dmg}.notary-log.json`, { force: true })
    if (zip) fs.rmSync(zipFile(outputDir, productName, version, arch), { force: true })
  }
  // With the ZIP, a build that writes no update metadata (no publish provider) must not pass with an earlier run's
  if (zip && fs.existsSync(outputDir)) {
    for (const name of fs.readdirSync(outputDir).filter(isUpdateMetadata)) fs.rmSync(path.join(outputDir, name), { force: true })
  }

  run('electron-vite', ['build'])
  run('electron-builder', [
    '--mac', '--publish', 'never', '-c.mac.notarize=false',
    ...(release ? [`-c.afterSign=${hookPath}`] : [])
  ])

  const apps = findBuiltApps({ outputDir, productName, arches, run })
  const teams = new Map()
  for (const { arch, app } of apps) {
    const display = run('codesign', ['--display', '--verbose=4', app])
    const output = [display.stdout, display.stderr].join('\n')
    assertDeveloperIdSigned(output, app)
    teams.set(arch, teamIdentifier(output))
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
    // In release every app must leave the build stapled; a hook that never ran would leave it bare
    if (release) run('xcrun', ['stapler', 'validate', app])
  }

  // Launching leaves the bundle's bytes as they are, so this can follow the signature checks and the tickets
  checkLaunchInputs(apps, { productName, env, launch, hostArch, log })

  // DMG signing writes no log line, so each DMG's signature is checked against the team of the app inside it
  const dmgs = arches.map((arch) => {
    const dmg = dmgFile(outputDir, productName, version, arch)
    if (!fs.existsSync(dmg)) throw new Error(`no DMG for ${arch} after the build: ${dmg}`)
    run('codesign', ['--verify', '--verbose=4', dmg])
    const display = run('codesign', ['--display', '--verbose=4', dmg])
    assertDmgSignature([display.stdout, display.stderr].join('\n'), teams.get(arch))
    return dmg
  })

  // The ZIP electron-updater installs from holds the same app as the DMG of its arch
  const zips = zip ? arches.map((arch) => {
    const file = zipFile(outputDir, productName, version, arch)
    if (!fs.existsSync(file)) throw new Error(`no ZIP for ${arch} after the build: ${file}`)
    checkZippedApp(file, { productName, teamId: teams.get(arch), stapled: release, run })
    return file
  }) : []
  return { apps, dmgs, zips }
}

/**
 * The afterSign hook: notarize and staple the .app electron-builder has just signed, before its DMG is built — a
 * DMG made from an app without its own ticket cannot get one afterwards, and the app is what users drag out.
 * Mac App Store builds are not notarized here. Missing credentials fail the build rather than skip.
 */
async function afterSign(context, deps = {}) {
  if (context.electronPlatformName !== 'darwin') return undefined
  const {
    env = process.env,
    run = runCommand,
    writeError = (message) => console.error(`[mac] Apple log:\n${message}`),
    writeNotaryLog = (file, contents) => fs.writeFileSync(file, contents),
    log = (message) => console.log(message)
  } = deps
  const credentials = readCredentials(env)
  const { productFilename, version } = context.packager.appInfo
  const app = path.join(context.appOutDir, `${productFilename}.app`)
  const arch = appArch(app, productFilename, run)

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notarize-app-'))
  try {
    // Each submission waits on Apple for minutes; say which app is being waited on
    log(`[mac] notarizing ${arch}: ${app}`)
    // notarytool takes an archive, not a bundle; --keepParent keeps the .app as the archive's root
    const zip = path.join(workDir, `${productFilename}-${arch}.zip`)
    run('ditto', ['-c', '-k', '--keepParent', app, zip])
    const { submissionId, log: notaryLog } = submitForNotarization(zip, { credentials, run, writeError })
    writeNotaryLog(appNotaryLogFile(context.outDir, productFilename, version, arch), notaryLog)
    run('xcrun', ['stapler', 'staple', app])
    run('xcrun', ['stapler', 'validate', app])
    log(`[mac] accepted ${arch} (submission: ${submissionId})`)
    return submissionId
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

/**
 * The files of one kind to gate, in config order: every file with the kind's extension in the version directory
 * must be one of the expected names (one per configured arch), and every expected name must be there — a leftover or
 * a missing file fails before any submission.
 */
function selectByArch(files, { productName, version, arches }, { extension, kind, fileOf }) {
  const expected = new Map(arches.map((arch) => [path.basename(fileOf('', productName, version, arch)), arch]))
  const found = files.filter((file) => file.endsWith(extension))
  const unexpected = found.filter((file) => !expected.has(path.basename(file)))
  if (unexpected.length > 0) throw new Error(`unexpected ${kind}: ${unexpected.map((file) => path.basename(file)).join(', ')}`)
  return arches.map((arch) => {
    const file = found.find((candidate) => expected.get(path.basename(candidate)) === arch)
    if (!file) throw new Error(`missing ${kind} for ${arch}: ${path.basename(fileOf('', productName, version, arch))}`)
    return file
  })
}

/** The DMGs to gate, one per configured arch, in config order */
function selectDmgArtifacts(files, layout) {
  return selectByArch(files, layout, { extension: '.dmg', kind: 'DMG', fileOf: dmgFile })
}

/** A file's SHA-512 in base64, the form electron-builder records in the update metadata; the file is only read */
function fileSha512(file) {
  const hash = crypto.createHash('sha512')
  const fd = fs.openSync(file, 'r')
  try {
    const chunk = Buffer.alloc(1024 * 1024)
    let read
    while ((read = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, read))
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('base64')
}

/**
 * The one update metadata file must be this version's and list exactly these ZIPs, each with the size and sha512 the
 * file has: the updater downloads the ZIP the metadata names and refuses it when its hash differs.
 */
function checkUpdateMetadata(outputDir, files, zips, version) {
  const found = files.map((file) => path.basename(file)).filter(isUpdateMetadata).sort()
  if (found.length === 0) {
    throw new Error(`no update metadata (*-mac.yml) in ${outputDir}: electron-builder writes it only when a publish provider is configured or detected`)
  }
  if (found.length > 1) throw new Error(`more than one update metadata file in ${outputDir}: ${found.join(', ')}`)
  const [name] = found
  const metadataFile = path.join(outputDir, name)
  const metadata = yamlParser().load(fs.readFileSync(metadataFile, 'utf8'))
  if (metadata?.version !== version) throw new Error(`${name} is for version ${metadata?.version ?? 'none'}, not ${version}`)
  const entries = Array.isArray(metadata.files) ? metadata.files : []
  const zipNames = zips.map((zip) => path.basename(zip))
  const foreign = entries.map((entry) => entry?.url).filter((url) => !zipNames.includes(url))
  if (foreign.length > 0) throw new Error(`${name} lists a file that is not one of this build's ZIPs: ${foreign.join(', ')}`)
  for (const zip of zips) {
    const zipName = path.basename(zip)
    const listed = entries.filter((entry) => entry.url === zipName)
    if (listed.length === 0) throw new Error(`${name} does not list ${zipName}`)
    if (listed.length > 1) throw new Error(`${name} lists ${zipName} ${listed.length} times`)
    const { size } = fs.statSync(zip)
    if (listed[0].size !== size) throw new Error(`${name} records size ${listed[0].size} for ${zipName}, the file has ${size} bytes`)
    if (listed[0].sha512 !== fileSha512(zip)) throw new Error(`${name} records another sha512 for ${zipName} than the file has`)
  }
  return metadataFile
}

/**
 * The artifact set the DMG gate runs on, checked before anything is submitted: one DMG per configured arch and, with
 * the ZIP, one ZIP per arch and the update metadata that vouches for them. Nothing here writes a file.
 */
function checkArtifactSet(outputDir, layout) {
  const files = fs.readdirSync(outputDir).map((name) => path.join(outputDir, name))
  const dmgs = selectDmgArtifacts(files, layout)
  if (!layout.zip) return { dmgs, zips: [], metadata: null }
  const zips = selectByArch(files, layout, { extension: '.zip', kind: 'ZIP', fileOf: zipFile })
  return { dmgs, zips, metadata: checkUpdateMetadata(outputDir, files, zips, layout.version) }
}

function makeMountPoint() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mac-dmg-'))
}

function removeMountPoint(mountPoint) {
  fs.rmSync(mountPoint, { recursive: true, force: true })
}

function findMountedApp(mountPoint, productName) {
  const appPath = path.join(mountPoint, `${productName}.app`)
  if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) {
    throw new Error(`no ${productName}.app in the mounted DMG: ${mountPoint}`)
  }
  return appPath
}

/** The DMG gate for one DMG: verify, check the signature, notarize, staple, assess, and check the app inside */
function notarizeDmg(file, options) {
  const {
    credentials,
    findApp,
    makeMountPoint: mount,
    removeMountPoint: unmount,
    run,
    writeError = console.error,
    writeNotaryLog = (logFile, contents) => fs.writeFileSync(logFile, contents)
  } = options
  run('hdiutil', ['verify', file])
  run('codesign', ['--verify', '--verbose=4', file])
  const signature = run('codesign', ['--display', '--verbose=4', file])
  assertDmgSignature([signature.stdout, signature.stderr].filter(Boolean).join('\n'), credentials.teamId)
  const { submissionId, log } = submitForNotarization(file, { credentials, run, writeError })
  writeNotaryLog(`${file}.notary-log.json`, log)

  run('xcrun', ['stapler', 'staple', file])
  run('xcrun', ['stapler', 'validate', file])
  run('hdiutil', ['verify', file])
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', file])

  const mountPoint = mount()
  let attached = false
  let operationError = null
  try {
    run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountPoint, file])
    attached = true
    const appPath = findApp(mountPoint)
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
    // The app inside must carry its own ticket: users drag it out of the DMG, leaving the DMG's ticket behind,
    // and `spctl --assess` succeeds online by looking the ticket up, so only `stapler validate` tells them apart
    run('xcrun', ['stapler', 'validate', appPath])
  } catch (error) {
    operationError = error
  }

  let cleanupError = null
  let detached = !attached
  if (attached) {
    try {
      run('hdiutil', ['detach', mountPoint])
      detached = true
    } catch {
      try {
        run('hdiutil', ['detach', '-force', mountPoint])
        detached = true
      } catch (error) {
        cleanupError = error
      }
    }
  }
  if (detached) {
    try {
      unmount(mountPoint)
    } catch (error) {
      cleanupError ??= error
    }
  }
  if (operationError) throw operationError
  if (cleanupError) throw cleanupError
  return submissionId
}

// Build commands stream their progress to the terminal; every other command's output is captured for checks
const STREAMED = new Set(['electron-vite', 'electron-builder'])

function runStep(command, args) {
  if (!STREAMED.has(command)) return runCommand(command, args)
  console.log(`[mac] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`)
  return { stdout: '', stderr: '' }
}

function main(argv, env = process.env, root = process.cwd()) {
  const command = argv[0]
  if (!['local', 'release', 'notarize-dmg'].includes(command)) {
    throw new Error('usage: node <path>/mac-packaging.cjs <local|release|notarize-dmg>')
  }
  const configFile = path.join(root, 'electron-builder.yml')
  if (!fs.existsSync(configFile)) throw new Error(`run from the project root: no electron-builder.yml in ${root}`)
  const layout = resolveLayout(yamlParser().load(fs.readFileSync(configFile, 'utf8')), fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const outputDir = path.join(root, layout.outputDir)

  if (command === 'notarize-dmg') {
    const credentials = readCredentials(env)
    const { dmgs, zips, metadata } = checkArtifactSet(outputDir, layout)
    if (metadata) console.log(`[mac] ${path.basename(metadata)} matches ${zips.map((zip) => path.basename(zip)).join(', ')}`)
    const ids = dmgs.map((file) => {
      console.log(`[mac] gating ${file}`)
      const id = notarizeDmg(file, {
        credentials,
        findApp: (mountPoint) => findMountedApp(mountPoint, layout.productName),
        makeMountPoint,
        removeMountPoint,
        run: runCommand,
        writeError: (message) => console.error(`[mac] Apple log:\n${message}`)
      })
      console.log(`[mac] passed ${file} (submission: ${id})`)
      return id
    })
    console.log(`[mac] all ${layout.arches.join(', ')} DMGs passed: ${ids.join(', ')}`)
    return ids
  }

  // electron-builder resolves the hook relative to the project root, wherever this file was copied to
  const hookPath = path.relative(root, __filename)
  if (hookPath.startsWith('..') || path.isAbsolute(hookPath)) throw new Error(`this script must live inside the project: ${__filename}`)
  const result = packageMac({ profile: command, env, run: runStep, ...layout, outputDir, hookPath })
  console.log(`[mac] ${command} packaging done for ${layout.arches.join(', ')}`)
  return result
}

module.exports = {
  afterSign,
  assertDmgSignature,
  certificateSource,
  checkArtifactSet,
  checkLaunchInputs,
  configuredArches,
  findBuiltApps,
  findMountedApp,
  launchApp,
  main,
  notarizeDmg,
  packageMac,
  parseAcceptedLog,
  parseAcceptedSubmission,
  readCredentials,
  resolveLayout,
  selectDmgArtifacts,
  submitForNotarization,
  yamlParser
}

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`[mac] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
