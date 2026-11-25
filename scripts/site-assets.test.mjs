// The command that sends the site's app assets to the website repository (scripts/site-assets.mjs): what it refuses
// before it touches anything, what it sends when an asset changed, and that what it sends is the assets alone.
//
// The website repository is a bare repository on disk, cloned through a file:// URL so that `--depth` works as it does
// against GitHub; Transfer's own repository is a scratch repository holding build/icon.svg; git runs for real in both.
// What stands in for the system boundary: `gh` (`gh api user` answers a fixed account, and the pull request is a recorded
// call), and nothing else: the command starts git and gh only, which the last case records.
//
// Gap: nothing here reaches GitHub. `git push` to github.com and `gh pr create` run for real only in a run of the
// command itself; the evidence run recorded in the delivery of the pull request that added it is the one such run.
//
// Gap: that the website's pages read the screenshot and the icon from the paths the command writes is not tested here, since
// the pages are not in this repository; a test of the built pages in aloong-planet-home (apps/transfer) pins those paths.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ASSET_DIR, ASSET_PATHS, DEFAULT_REPO, ICON_SOURCE, SHOT_NAMES, SHOT_SIZE, assertOnlyAssets, identityFromUser, main, pngSize, readShots, runCommand
} from './site-assets.mjs'

// No test reads the machine's git configuration: a signing key or a commit template there must not change a run
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com'
})

const scratch = []
const dir = (name) => {
  const path = mkdtempSync(join(tmpdir(), `site-assets-test-${name}-`))
  scratch.push(path)
  return path
}
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })))

const git = (cwd, ...args) => runCommand('git', args, { cwd }).trim()

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])

/** The bytes of a PNG that has a header of this size and an end chunk, and a body that tells one picture from another */
function png(width, height, picture = '') {
  const header = Buffer.alloc(33)
  PNG_SIGNATURE.copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'latin1')
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return Buffer.concat([header, Buffer.from(picture), PNG_END])
}
const shot = (picture = 'the screenshot') => png(SHOT_SIZE.width, SHOT_SIZE.height, picture)

/** A directory with the screenshot, `picture` naming what it shows */
function shotsDir(picture) {
  const path = dir('shots')
  writeFileSync(join(path, 'main.png'), shot(picture))
  return path
}

const ICON = (colour = '#8a67ab') => `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="${colour}"/></svg>\n`

/** Transfer's repository, as far as the command reads it: a commit holding build/icon.svg */
function transfer(icon = ICON()) {
  const root = dir('transfer')
  git(root, 'init', '--quiet', '--initial-branch=master')
  mkdirSync(join(root, 'build'))
  writeFileSync(join(root, ICON_SOURCE), icon)
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'icon')
  return root
}

/** The website repository: a bare repository whose main holds every asset as the command would write it from `icon` and `picture` */
function website({ icon = ICON(), picture = 'the screenshot', branch = 'main' } = {}) {
  const bare = join(dir('website'), 'website.git')
  git(dirname(bare), 'init', '--quiet', '--bare', `--initial-branch=${branch}`, bare)
  const work = dir('website-work')
  git(work, 'init', '--quiet', `--initial-branch=${branch}`)
  mkdirSync(join(work, ASSET_DIR, 'screenshots'), { recursive: true })
  writeFileSync(join(work, ASSET_DIR, 'screenshots', 'main.png'), shot(picture))
  writeFileSync(join(work, ASSET_DIR, 'favicon.svg'), icon)
  mkdirSync(join(work, 'apps', 'home'), { recursive: true })
  writeFileSync(join(work, 'apps', 'home', 'index.html'), '<p>the homepage</p>')
  git(work, 'add', '.')
  git(work, 'commit', '--quiet', '-m', 'the website repository')
  git(work, 'push', '--quiet', bare, branch)
  return { bare, url: `file://${bare}` }
}

/**
 * What `gh api user` answers for the account `gh` is logged in as: the keys GitHub's answer has, with a public profile name and
 * address among them, which the commit's identity must not take
 */
const GH_USER = JSON.stringify({
  login: 'octo-example', id: 4242, node_id: 'MDQ6VXNlcjQyNDI=', type: 'User', name: 'Octo Example', email: 'octo-public@example.org',
  notification_email: 'octo-private@example.org', html_url: 'https://github.com/octo-example'
})
const NOREPLY = '4242+octo-example@users.noreply.github.com'
const AS_THE_ACCOUNT = `octo-example <${NOREPLY}> | octo-example <${NOREPLY}>`

/**
 * A run of the command with `gh` faked; resolves to what it printed and sent. `gh api user` is recorded in `users` and answered by
 * `fakeUser`, every other `gh` call is a pull request in `prs` that `fakeGh` answers, and `onRun` sees every call before it runs.
 */
async function send(argv, { root = transfer(), site = website(), fakeGh, fakeUser, onRun } = {}) {
  const printed = []
  const prs = []
  const users = []
  const calls = []
  const run = (command, args, options) => {
    calls.push([command, args, options])
    onRun?.(command, args, options)
    if (command !== 'gh') return runCommand(command, args, options)
    if (args[0] === 'api') {
      users.push(args)
      return fakeUser ? fakeUser(args) : GH_USER
    }
    prs.push(args)
    if (fakeGh) return fakeGh(args)
    return 'https://github.com/aloong-planet/aloong-planet-home/pull/1\n'
  }
  const code = await main([...argv, '--remote', site.url], {
    root, run, log: (text) => printed.push(text), now: () => new Date('2026-11-25T10:00:00Z')
  })
  return { code, printed: printed.join('\n'), prs, users, calls, site, root }
}

/** The author and the committer of a commit, as `<name> <address>` each */
const whoMade = (cwd, rev) => git(cwd, 'log', '-1', '--format=%an <%ae> | %cn <%ce>', rev)
const branches = (site) => git(site.bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').sort()
const changedBy = (site, branch) => git(site.bare, 'diff', '--name-only', `main...${branch}`).split('\n').filter(Boolean)
const clones = (result) => result.calls.filter(([command, args]) => command === 'git' && args[0] === 'clone')
const SHOT_PATH = `${ASSET_DIR}/screenshots/main.png`
const ICON_PATH = `${ASSET_DIR}/favicon.svg`

test('the command writes one screenshot and the favicon, at these paths of the website repository, and takes the icon from build/icon.svg', () => {
  assert.deepEqual(SHOT_NAMES, ['main.png'])
  assert.deepEqual(ASSET_PATHS, ['apps/transfer/public/screenshots/main.png', 'apps/transfer/public/favicon.svg'])
  assert.equal(ICON_SOURCE, 'build/icon.svg')
})

test('a PNG is read for its size, and a file that is no whole PNG is named for what is wrong with it', () => {
  assert.deepEqual(pngSize(png(1800, 1280)), { width: 1800, height: 1280 })
  assert.match(pngSize(Buffer.from('GIF89a, not a PNG at all, but long enough to have a header to read')).problem, /not a PNG/)
  assert.match(pngSize(png(1800, 1280).subarray(0, 40)).problem, /cut short/)
  assert.match(pngSize(Buffer.alloc(0)).problem, /not a PNG/)
})

test('the screenshots are checked as a set: each one that is missing, extra, cut short, no PNG or of another size is a problem of its own', () => {
  assert.deepEqual(readShots(shotsDir()).problems, [])
  assert.deepEqual(readShots(shotsDir()).shots, ['main.png'])

  const missing = shotsDir()
  rmSync(join(missing, 'main.png'))
  assert.deepEqual(readShots(missing).problems, ['main.png is missing'])

  const extra = shotsDir()
  writeFileSync(join(extra, 'hero.png'), shot('another'))
  assert.deepEqual(readShots(extra).problems, ['hero.png is not the site\'s screenshot'])
  assert.deepEqual(readShots(extra).shots, ['main.png'])

  const damaged = shotsDir()
  writeFileSync(join(damaged, 'main.png'), 'not a picture')
  assert.deepEqual(readShots(damaged).problems, ['main.png is not a PNG'])
  writeFileSync(join(damaged, 'main.png'), png(1800, 1280).subarray(0, 40))
  assert.deepEqual(readShots(damaged).problems, ['main.png is cut short: it does not end with the PNG end chunk'])
  // Either side of the size alone is wrong: a screenshot that is as wide as the hero's image, or as high, but not both
  for (const [width, height] of [[1840, 1280], [1800, 1035]]) {
    writeFileSync(join(damaged, 'main.png'), png(width, height))
    assert.deepEqual(readShots(damaged).problems, [`main.png is ${width}×${height}, not 1800×1280`], `${width}×${height}`)
    assert.deepEqual(readShots(damaged).shots, [], `${width}×${height}`)
  }

  // A directory can be wrong in two ways at once, and both are said: the screenshot the Mac named itself is not main.png
  const macName = dir('shots')
  writeFileSync(join(macName, 'Screenshot 2026-11-25 at 10.12.30.png'), shot('retaken'))
  assert.deepEqual(readShots(macName).problems, ['main.png is missing', 'Screenshot 2026-11-25 at 10.12.30.png is not the site\'s screenshot'])

  // The Finder's file is no screenshot and no problem
  const finder = shotsDir()
  writeFileSync(join(finder, '.DS_Store'), 'x')
  assert.deepEqual(readShots(finder).problems, [])
  assert.match(readShots(join(finder, 'nowhere')).problems[0], /cannot be read: ENOENT/)
})

test('only the site\'s assets may be changed', () => {
  assertOnlyAssets(ASSET_PATHS)
  assertOnlyAssets([])
  for (const stray of [
    'apps/home/index.html', 'apps/transfer/src/i18n/ui.ts', `${ASSET_DIR}/screenshots/extra.png`, `${ASSET_DIR}/screenshots/../../src/x.js`,
    `${ASSET_DIR}/icon.svg`, 'README.md'
  ]) {
    assert.throws(() => assertOnlyAssets([ASSET_PATHS[0], stray]), (error) => error.message.includes(stray), stray)
  }
})

test('the commit\'s identity is the account\'s login and its noreply address, not the profile\'s name or address', () => {
  assert.deepEqual(identityFromUser(GH_USER), { name: 'octo-example', email: NOREPLY })
  assert.equal(identityFromUser('{"login":"octo_example","id":7}').email, '7+octo_example@users.noreply.github.com')
})

test('an answer that has no login and numeric id to make the identity of is refused', () => {
  const rows = [
    ['not JSON', 'Not Found'], ['no login', '{"id":7}'], ['no id', '{"login":"octo"}'], ['a login that is not a name', '{"login":"octo example","id":7}'],
    ['an id that is not a number', '{"login":"octo","id":"7"}'], ['an id that is zero', '{"login":"octo","id":0}'], ['null', 'null']
  ]
  for (const [name, answer] of rows) assert.throws(() => identityFromUser(answer), /did not answer with a login and an id/, name)
})

test('shots that cannot be used stop the run before any command starts, and every problem with them is printed', async () => {
  const wrongName = dir('shots')
  writeFileSync(join(wrongName, 'Screenshot 2026-11-25 at 10.12.30.png'), shot('retaken'))
  const result = await send(['--shots', wrongName])
  assert.equal(result.code, 1)
  assert.match(result.printed, /main\.png is missing/)
  assert.match(result.printed, /Screenshot 2026-11-25 at 10\.12\.30\.png is not the site's screenshot/)
  assert.deepEqual(result.calls, [], 'no command ran')
})

test('an option that makes no sense is refused, by its own refusal, before any command starts', async () => {
  const shots = shotsDir()
  // Each row is good in every other respect (a directory that holds the screenshot, a repository that holds the icon), so that
  // only the option can be what stops the run; and a run that was not stopped would reach the commands, which are recorded
  const rows = [
    ['an option that does not exist', ['--shots', shots, '--dryrun'], 'unknown option --dryrun'],
    ['a value that is missing after --title', ['--shots', shots, '--title'], '--title needs a value'],
    ['a value that is missing after --shots', ['--shots'], '--shots needs a value'],
    ['no --shots at all', ['--dry-run'], '--shots <directory> is required']
  ]
  for (const [name, argv, message] of rows) {
    const errors = []
    const calls = []
    const code = await main(argv, { root: transfer(), run: (...call) => { calls.push(call); return '' }, logError: (text) => errors.push(text), log: () => {} })
    assert.equal(code, 1, name)
    assert.equal(errors.length, 1, name)
    assert.ok(errors[0].startsWith(message), `${name}: ${errors[0]}`)
    assert.deepEqual(calls, [], `${name}: no command ran`)
  }
})

test('an icon source with uncommitted changes stops the run', async () => {
  const root = transfer()
  writeFileSync(join(root, ICON_SOURCE), ICON('#000000'))
  const result = await send(['--shots', shotsDir()], { root })
  assert.equal(result.code, 1)
  assert.match(result.printed, /build\/icon\.svg has uncommitted changes/)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(clones(result), [])
  assert.deepEqual(branches(result.site), ['main'])
})

test('an icon source that is no SVG stops the run, since the site would serve it as its icon', async () => {
  // Each row fails one half of "an <svg> element, and its closing tag at the end" and passes the other
  const rows = [
    ['text that is not an SVG at all', 'not an icon'],
    ['an SVG that is cut short: no closing tag', '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/>\n'],
    ['text that only ends the way an SVG does', 'this is a note about </svg>\n']
  ]
  for (const [name, icon] of rows) {
    const result = await send(['--shots', shotsDir()], { root: transfer(icon) })
    assert.equal(result.code, 1, name)
    assert.match(result.printed, /build\/icon\.svg is not an SVG/, name)
    assert.deepEqual(clones(result), [], name)
    assert.deepEqual(result.prs, [], name)
  }
})

test('when gh cannot say who is logged in, the run stops before it clones or sends anything, and says why', async () => {
  const rows = [
    ['gh fails', () => { throw new Error('gh api user failed: not logged in') }, /gh api user failed: not logged in/],
    ['gh answers with something else', () => 'Not Found', /`gh api user` did not answer with a login and an id/]
  ]
  for (const [name, fakeUser, reason] of rows) {
    const result = await send(['--shots', shotsDir('retaken')], { fakeUser })
    assert.equal(result.code, 1, name)
    assert.match(result.printed, /the identity of the commit cannot be taken from gh: /, name)
    assert.match(result.printed, reason, name)
    assert.deepEqual(clones(result), [], name)
    assert.deepEqual(result.prs, [], name)
    assert.deepEqual(branches(result.site), ['main'], name)
  }
})

test('when no asset changed, nothing is pushed and no pull request is opened', async () => {
  const result = await send(['--shots', shotsDir()])
  assert.equal(result.code, 0)
  assert.match(result.printed, /nothing to send/)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
})

test('a retaken screenshot is sent as one branch and one pull request that change that file alone', async () => {
  const result = await send(['--shots', shotsDir('retaken')])
  assert.equal(result.code, 0)
  const head = git(result.root, 'rev-parse', 'HEAD')
  const branch = `assets/transfer-20261125-${head.slice(0, 7)}`
  assert.deepEqual(branches(result.site), [branch, 'main'])
  assert.deepEqual(changedBy(result.site, branch), [SHOT_PATH])
  assert.equal(git(result.site.bare, 'rev-list', '--count', `main..${branch}`), '1')

  assert.equal(result.prs.length, 1)
  const [pr] = result.prs
  const arg = (flag) => pr[pr.indexOf(flag) + 1]
  assert.deepEqual(pr.slice(0, 2), ['pr', 'create'])
  assert.equal(arg('--repo'), DEFAULT_REPO)
  assert.equal(arg('--base'), 'main')
  assert.equal(arg('--head'), branch)
  assert.equal(arg('--title'), `Update Transfer's site screenshot and icon (transfer ${head.slice(0, 7)})`)
  const body = arg('--body')
  assert.match(body, new RegExp(`from its commit ${head}`))
  assert.match(body, /Changed files \(1\)/)
  assert.ok(body.includes(`- ${SHOT_PATH}`))
  // The text says nothing about where the command ran, closes no ticket of the website repository, and refers to no issue or pull
  // request by a bare number, which would mean the website repository's, not Transfer's
  for (const local of [result.root, tmpdir()]) assert.ok(!body.includes(local), `the body names ${local}`)
  assert.doesNotMatch(body, /\b(close[sd]?|fix(e[sd])?|resolve[sd]?):? *#\d+/i)
  assert.doesNotMatch(body, /#\d+/)
  assert.match(result.printed, /opened https:\/\/github\.com\/aloong-planet\/aloong-planet-home\/pull\/1/)
  // The commit's own message says the same as the pull request
  assert.match(git(result.site.bare, 'log', '-1', '--format=%B', branch), new RegExp(`from its commit ${head}`))
})

test('the commit that is pushed is the logged-in account\'s, under its noreply address, whatever the Mac\'s own git identity is', async () => {
  const config = join(dir('gitconfig'), 'config')
  writeFileSync(config, '[user]\n\tname = Personal Name\n\temail = personal@example.com\n')
  const keys = ['GIT_CONFIG_GLOBAL', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: config, GIT_AUTHOR_NAME: 'Env Author', GIT_AUTHOR_EMAIL: 'env-author@example.com',
    GIT_COMMITTER_NAME: 'Env Committer', GIT_COMMITTER_EMAIL: 'env-committer@example.com'
  })
  let result
  try {
    result = await send(['--shots', shotsDir('retaken')])
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
  }
  assert.equal(result.code, 0)
  const branch = branches(result.site).find((name) => name !== 'main')
  // Author and committer both: the login as the name and `<id>+<login>@users.noreply.github.com` as the address, not the
  // profile's public name or address that gh's answer also holds
  assert.equal(whoMade(result.site.bare, branch), AS_THE_ACCOUNT)
  assert.deepEqual(result.users, [['api', 'user']])
})

test('a changed app icon sends the favicon alone, with the contents of build/icon.svg', async () => {
  const redrawn = ICON('#123456')
  const result = await send(['--shots', shotsDir()], { root: transfer(redrawn), site: website({ icon: ICON() }) })
  assert.equal(result.code, 0)
  const branch = branches(result.site).find((name) => name !== 'main')
  assert.deepEqual(changedBy(result.site, branch), [ICON_PATH])
  assert.equal(git(result.site.bare, 'show', `${branch}:${ICON_PATH}`), redrawn.trimEnd())
})

test('--title and --note describe a pull request that is not meant to be merged', async () => {
  const result = await send(['--shots', shotsDir('marked'), '--title', 'Evidence run: do not merge', '--note', 'An evidence run of the asset command; it will not be merged.'])
  const [pr] = result.prs
  assert.equal(pr[pr.indexOf('--title') + 1], 'Evidence run: do not merge')
  assert.ok(pr[pr.indexOf('--body') + 1].startsWith('An evidence run of the asset command; it will not be merged.\n\nOpened by'))
})

test('a dry run commits locally as the account, sends nothing and keeps the clone for inspection', async (t) => {
  const result = await send(['--shots', shotsDir('retaken'), '--dry-run'])
  assert.equal(result.code, 0)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
  const kept = result.printed.match(/in (\S+site-assets-\S+\/home), nothing pushed/)?.[1]
  assert.ok(kept && existsSync(kept), 'the clone is kept and named')
  t.after(() => rmSync(dirname(kept), { recursive: true, force: true }))
  assert.deepEqual(git(kept, 'show', '--name-only', '--format=', 'HEAD').split('\n'), [SHOT_PATH])
  // The identity of the commit is the one a run that pushes would make it with, though nothing is pushed
  assert.equal(whoMade(kept, 'HEAD'), AS_THE_ACCOUNT)
  assert.match(result.printed, /title: Update Transfer's site screenshot and icon/)
  assert.ok(result.printed.includes(`  ${SHOT_PATH}`))
})

test('a second run from the same commit on the same day takes the next free branch name', async () => {
  const site = website()
  const root = transfer()
  const first = await send(['--shots', shotsDir('once')], { site, root })
  const second = await send(['--shots', shotsDir('twice')], { site, root })
  assert.equal(first.code + second.code, 0)
  const head = git(root, 'rev-parse', 'HEAD').slice(0, 7)
  assert.deepEqual(branches(site), [`assets/transfer-20261125-${head}`, `assets/transfer-20261125-${head}-2`, 'main'])
})

test('a file that is not one of the assets stops the run before anything is committed', async () => {
  // A stray file appears in the clone as soon as the command has made its branch, as one written by anything but the command would
  const onRun = (command, args, options) => {
    if (command === 'git' && args[0] === 'switch') writeFileSync(join(options.cwd, ASSET_DIR, 'extra.png'), 'not an asset')
  }
  const result = await send(['--shots', shotsDir('retaken')], { onRun })
  assert.equal(result.code, 1)
  assert.match(result.printed, /refusing to go on: 1 changed path\(s\) are not the site's assets: apps\/transfer\/public\/extra\.png/)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
  rmSync(result.printed.match(/kept in (\S+)\)/)[1], { recursive: true, force: true })
})

test('--base picks the branch of the website repository that the clone, the commit and the pull request start from', async () => {
  const result = await send(['--shots', shotsDir('retaken'), '--base', 'trunk'], { site: website({ branch: 'trunk' }) })
  assert.equal(result.code, 0)
  const [pr] = result.prs
  assert.equal(pr[pr.indexOf('--base') + 1], 'trunk')
  assert.equal(git(result.site.bare, 'rev-list', '--count', `trunk..${pr[pr.indexOf('--head') + 1]}`), '1')
})

test('a failed pull request is reported, with where the clone was kept', async () => {
  const result = await send(['--shots', shotsDir('retaken')], { fakeGh: () => { throw new Error('gh pr create failed: not logged in') } })
  assert.equal(result.code, 1)
  assert.match(result.printed, /failed: gh pr create failed: not logged in/)
  const kept = result.printed.match(/kept in (\S+)\)/)?.[1]
  assert.ok(kept && existsSync(kept))
  rmSync(kept, { recursive: true, force: true })
})

test('a run starts git and gh alone, asks gh who is logged in and opens one pull request, and never merges it', async () => {
  const result = await send(['--shots', shotsDir('retaken')])
  assert.equal(result.code, 0)
  assert.deepEqual([...new Set(result.calls.map(([command]) => command))].sort(), ['gh', 'git'])
  assert.deepEqual(result.calls.filter(([command]) => command === 'gh').map(([, args]) => args.slice(0, 2)), [['api', 'user'], ['pr', 'create']])
  for (const [command, args] of result.calls) assert.ok(!(args.includes('merge') || args.includes('--auto') || args.includes('--admin')), `${command} ${args.join(' ')}`)
})
