#!/usr/bin/env node
// The website's app assets: the screenshot and the app icon that Transfer's website takes from the app. The website
// lives in the aloong-planet-home repository (apps/transfer/), and its assets change there only through a pull
// request that this command opens (aloong-planet-home app-sites::REQ-004/AC-01).
//
//   pnpm site:assets --shots <directory> [--dry-run] [--title <text>] [--note <text>]
//                    [--remote <git url>] [--repo <owner/name>] [--base <branch>]
//
// What it does, in order:
//   1. Checks the directory of screenshots: exactly the one file main.png, a PNG of 1800×1280 pixels that is not cut short
//      (its header, and the end chunk where a PNG ends; the picture's data is not read). Anything missing, extra, cut short,
//      no PNG or of another size fails the run before anything else starts, and every problem is listed.
//   2. Refuses to go on when the app icon, build/icon.svg, has uncommitted changes, since the pull request names this
//      repository's HEAD as the source of the assets, or when it is not an SVG, since the site serves it as its favicon.
//   3. Asks `gh` who is logged in (`gh api user`) and takes the commit's author and committer from the answer: the
//      account's login as the name and its GitHub noreply address, <id>+<login>@users.noreply.github.com, as the address.
//      The pull request's commit is public, and the computer's own git identity is a person's, so that identity and the
//      git variables of the environment are not used. When `gh` cannot say, the run stops here, before it clones.
//   4. Clones the website repository's base branch into a new temporary directory, writes the two files at their paths
//      under apps/transfer/public/ (the screenshot, and the icon as the favicon, as the file build/icon.svg holds it),
//      stages exactly those paths, and refuses to go on when anything else is changed or staged. When no byte changed, it
//      says so and opens nothing.
//   5. Commits as that account on a new branch assets/transfer-<date>-<source commit>, pushes it and opens the pull
//      request with `gh`, whose body names the commit of this repository the assets come from. With --dry-run it stops
//      after the local commit, which has the same identity, prints what it would send, and keeps the clone for inspection.
//
// The screenshot is taken from the app by hand and not by this command. --title and --note replace the pull request's
// title and add a line at the top of its body, for a run whose pull request is not meant to be merged. The command never
// merges the pull request. Needs: git, and gh logged in with access to the website repository. Exit code 0 when the pull
// request is opened, the dry run is done or nothing changed, 1 otherwise.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOT_NAMES = ['main.png']
export const SHOT_SIZE = { width: 1800, height: 1280 }
export const ICON_SOURCE = 'build/icon.svg'
export const ASSET_DIR = 'apps/transfer/public'

export const DEFAULT_REMOTE = 'https://github.com/aloong-planet/aloong-planet-home.git'
export const DEFAULT_REPO = 'aloong-planet/aloong-planet-home'
export const DEFAULT_BASE = 'main'

const here = dirname(fileURLToPath(import.meta.url))

/** Every path the pull request may change, relative to the website repository's root */
export const ASSET_PATHS = [`${ASSET_DIR}/screenshots/main.png`, `${ASSET_DIR}/favicon.svg`]

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])

/** The size a PNG's header gives, or the reason the bytes are no PNG that is cut at neither end: not a PNG, or cut short */
export function pngSize(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    return { problem: 'is not a PNG' }
  }
  if (!bytes.subarray(bytes.length - PNG_END.length).equals(PNG_END)) return { problem: 'is cut short: it does not end with the PNG end chunk' }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** The names of the usable screenshots of a directory, and every problem with the directory, one sentence each */
export function readShots(dir) {
  const problems = []
  let entries = []
  try {
    entries = readdirSync(dir).filter((name) => name !== '.DS_Store').sort()
  } catch (error) {
    return { shots: [], problems: [`${dir} cannot be read: ${error.code ?? error.message}`] }
  }
  for (const name of SHOT_NAMES) if (!entries.includes(name)) problems.push(`${name} is missing`)
  for (const name of entries) if (!SHOT_NAMES.includes(name)) problems.push(`${name} is not the site's screenshot`)
  const shots = []
  for (const name of SHOT_NAMES.filter((n) => entries.includes(n))) {
    const size = pngSize(readFileSync(join(dir, name)))
    if (size.problem) problems.push(`${name} ${size.problem}`)
    else if (size.width !== SHOT_SIZE.width || size.height !== SHOT_SIZE.height) {
      problems.push(`${name} is ${size.width}×${size.height}, not ${SHOT_SIZE.width}×${SHOT_SIZE.height}`)
    } else shots.push(name)
  }
  return { shots, problems }
}

/**
 * The commit's identity from the answer of `gh api user`: the account's login as the name, and as the address the one GitHub
 * keeps for it, `<id>+<login>@users.noreply.github.com`, which names no personal address. The profile's own name and address,
 * which the answer also holds, are not used. Throws unless the answer has a login and a numeric id.
 */
export function identityFromUser(answer) {
  let user
  try {
    user = JSON.parse(answer)
  } catch {
    user = null
  }
  if (typeof user?.login !== 'string' || !/^[A-Za-z0-9_-]+$/.test(user.login) || !Number.isInteger(user.id) || user.id <= 0) {
    throw new Error('`gh api user` did not answer with a login and an id')
  }
  return { name: user.login, email: `${user.id}+${user.login}@users.noreply.github.com` }
}

/** Throws when a staged or changed path is not one of the site's assets */
export function assertOnlyAssets(paths) {
  const stray = paths.filter((path) => !ASSET_PATHS.includes(path))
  if (stray.length > 0) throw new Error(`refusing to go on: ${stray.length} changed path(s) are not the site's assets: ${stray.join(', ')}`)
}

function parseArgs(argv) {
  const options = { dryRun: false, remote: DEFAULT_REMOTE, repo: DEFAULT_REPO, base: DEFAULT_BASE }
  const valued = { '--shots': 'shots', '--title': 'title', '--note': 'note', '--remote': 'remote', '--repo': 'repo', '--base': 'base' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg in valued) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`)
      options[valued[arg]] = argv[++i]
    } else throw new Error(`unknown option ${arg}`)
  }
  if (!options.shots) throw new Error('--shots <directory> is required: the folder that holds the retaken screenshot, main.png')
  return options
}

/** Runs a command and returns its output; a failing command throws with its error output in the message */
export function runCommand(command, args, { cwd, env } = {}) {
  try {
    return execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const output = `${error.stderr ?? ''}`.trim()
    throw new Error(`${command} ${args.join(' ')} failed${output ? `: ${output}` : ''}`, { cause: error })
  }
}

const defaults = {
  run: runCommand,
  root: resolve(here, '..'),
  now: () => new Date()
}

const lines = (text) => text.split('\n').filter(Boolean)

/** The first branch name <base>, <base>-2, ... that the remote does not have */
function freeBranch(run, cwd, base) {
  for (let n = 1; n < 50; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`
    if (run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${name}`], { cwd }).trim() === '') return name
  }
  throw new Error(`the remote already has ${base} and 48 numbered variants`)
}

function pullRequestText({ options, source, changed }) {
  const title = options.title ?? `Update Transfer's site screenshot and icon (transfer ${source.slice(0, 7)})`
  const body = [
    ...(options.note ? [options.note, ''] : []),
    `Opened by \`pnpm site:assets\` in aloong-planet/transfer, from its commit ${source}.`,
    '',
    'Screenshot: taken from a directory given with `--shots`, not rendered by this run.',
    '',
    `Changed files (${changed.length}), all of them app assets of the Transfer site:`,
    ...changed.map((path) => `- ${path}`),
    '',
    `Nothing else is in this pull request: ${ASSET_PATHS.join(' and ')} are the only paths the command writes, and it refuses to go on when anything else is changed.`
  ].join('\n')
  return { title, body }
}

/** Whether the text is an SVG document: it has an <svg> element and ends with its closing tag */
const isSvg = (text) => /<svg[\s>]/.test(text) && text.trimEnd().endsWith('</svg>')

/** Runs the command; resolves to the exit code. `deps` replaces the system boundary in tests. */
export async function main(argv, deps = {}) {
  const { run, root, now, log = console.log, logError = console.error } = { ...defaults, ...deps }
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    logError(error.message)
    return 1
  }

  const shotsDir = resolve(options.shots)
  const { shots, problems } = readShots(shotsDir)
  if (problems.length > 0) {
    log(`the screenshots in ${options.shots} cannot be used:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    return 1
  }

  // The pull request names this repository's HEAD as the source of the assets, so the icon must be in it
  const iconSource = join(root, ICON_SOURCE)
  if (!existsSync(iconSource)) {
    log(`the app icon ${ICON_SOURCE} does not exist`)
    return 1
  }
  if (run('git', ['status', '--porcelain', '--', ICON_SOURCE], { cwd: root }).trim() !== '') {
    log(`${ICON_SOURCE} has uncommitted changes: commit it first, so that the pull request names a commit that holds the icon it carries`)
    return 1
  }
  if (!isSvg(readFileSync(iconSource, 'utf8'))) {
    log(`${ICON_SOURCE} is not an SVG: the site serves it as its favicon`)
    return 1
  }

  // Asked before anything is cloned
  let identity
  try {
    identity = identityFromUser(run('gh', ['api', 'user']))
  } catch (error) {
    log(`the identity of the commit cannot be taken from gh: ${error.message}`)
    return 1
  }

  let work
  let keep = options.dryRun
  try {
    const source = run('git', ['rev-parse', 'HEAD'], { cwd: root }).trim()

    work = mkdtempSync(join(tmpdir(), 'site-assets-'))
    const home = join(work, 'home')
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', options.base, '--single-branch', options.remote, home])
    const stamp = now().toISOString().slice(0, 10).replaceAll('-', '')
    const branch = freeBranch(run, home, `assets/transfer-${stamp}-${source.slice(0, 7)}`)
    run('git', ['switch', '--quiet', '-c', branch], { cwd: home })

    mkdirSync(join(home, ASSET_DIR, 'screenshots'), { recursive: true })
    for (const name of shots) copyFileSync(join(shotsDir, name), join(home, ASSET_DIR, 'screenshots', name))
    copyFileSync(iconSource, join(home, ASSET_DIR, 'favicon.svg'))

    // Everything git sees as changed must be an asset before anything is staged; what is staged is then the assets alone,
    // since `git add` is given those paths and no others
    const status = lines(run('git', ['status', '--porcelain', '--untracked-files=all', '-z'], { cwd: home }).replaceAll('\0', '\n')).map((l) => l.slice(3))
    assertOnlyAssets(status)
    run('git', ['add', '--', ...ASSET_PATHS], { cwd: home })
    const changed = lines(run('git', ['diff', '--cached', '--name-only'], { cwd: home }))
    if (changed.length === 0) {
      keep = false
      log(`the site's assets are already what ${options.shots} and ${ICON_SOURCE} give: nothing to send`)
      return 0
    }

    const { title, body } = pullRequestText({ options, source, changed })
    // The variables are git's own, and they win over the computer's git configuration and over the same variables of the environment
    const commitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email
    }
    run('git', ['commit', '--quiet', '-m', title, '-m', body], { cwd: home, env: commitEnv })
    if (options.dryRun) {
      log(`dry run: committed ${changed.length} file(s) on ${branch} in ${home}, nothing pushed:\n${changed.map((p) => `  ${p}`).join('\n')}`)
      log(`title: ${title}\nbody:\n${body}`)
      return 0
    }
    // Raises git's HTTP post buffer from its default of 1 MiB, so that a push of an image larger than that is not sent in
    // chunks (http.postBuffer in git-config)
    run('git', ['-c', 'http.postBuffer=524288000', 'push', '--quiet', 'origin', branch], { cwd: home })
    const url = run('gh', ['pr', 'create', '--repo', options.repo, '--base', options.base, '--head', branch, '--title', title, '--body', body], { cwd: home }).trim()
    log(`opened ${url}`)
    return 0
  } catch (error) {
    keep = true
    log(`failed: ${error.message}${work ? `\n  (the clone is kept in ${work})` : ''}`)
    return 1
  } finally {
    if (work && !keep) rmSync(work, { recursive: true, force: true })
  }
}

function isMain() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMain()) process.exitCode = await main(process.argv.slice(2))
