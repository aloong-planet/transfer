#!/usr/bin/env node
// Checks the include contract of the prototype pages under docs/prototypes/ (ADR-0014): the files there change no
// executable content and are outside every build, so no test reads them, and this command is how they are checked.
// It runs as a step of the `checks` job (.github/workflows/checks.yml) and the same way locally, from anywhere:
//   node scripts/check-prototype-contract.mjs
// An optional argument names another folder to check instead of docs/prototypes/ (the same layout).
//
// A page is every .html file under the folder except the gallery shell index.html beside manifest.js and anything
// under vendor/. The rules, numbered as in the output:
//   1. A page's first four <script src> are manifest.js, app-identity.js, dimensions.js and demo-dimensions.js, in
//      that order, each with the prefix that reaches the folder from the page; the fourth carries data-follow or
//      data-settings.
//   2. No page contains prefers-color-scheme, matchMedia, data-lang-btn or data-theme-btn.
//   3. A custom property declared in a .css file under _shared/ is declared in no page, and a page that uses
//      var(--name) for one links the _shared file that declares it. OWN_TOKENS lists the exceptions.
//   4. A page that manifest.js registers as ui or candidates has, between the doctype and the root element, one
//      comment, the single line `Review notes: <page file name without extension>.md`, and that file exists beside it.
//   5. Every path in manifest.js exists, every page has an entry, and an entry's type is candidates exactly when its
//      file name starts with candidates-.
//   6. demo-dimensions.js, app-identity.js, index.html and demo-harness.js each carry the marker
//      `copied from the prototype skill's template` in the file's first comment.
//
// One line per violation: <file>:<line>: rule <n>: <message>. Exit 0: none found. Exit 1: at least one found. Exit 2:
// it could not check (no page, manifest.js unreadable or not a registry, or any error of its own), so reading nothing
// is never a pass. Plain Node, no dependency, no browser; it reads the files and runs none of the pages.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RULE_COUNT = 6

const INCLUDES = ['manifest.js', 'app-identity.js', 'dimensions.js', 'demo-dimensions.js']
const FORBIDDEN = ['prefers-color-scheme', 'matchMedia', 'data-lang-btn', 'data-theme-btn']
const COPIED_FILES = ['demo-dimensions.js', 'app-identity.js', 'index.html', 'demo-harness.js']
const COPY_MARKER = "copied from the prototype skill's template"

// Pages that do not draw the app window and keep a token of their own whose name the shared palette also uses
// (#124 left them per page, as page chrome). Rule 3 lets exactly these pages declare exactly these names. An entry
// is itself a violation when its page no longer declares the name, when _shared no longer declares it, or when the
// page also links the _shared file that declares it.
const OWN_TOKENS = {
  'landing-page/prototype-footer-beian.html': ['--bg'],
  'screenshot/prototype-annotation-toolbar.html': ['--ink', '--muted']
}

class CannotCheck extends Error {}

// Every file the checks read goes through here, so an unreadable one is "could not check", never a pass or a crash.
function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    throw new CannotCheck(`cannot read ${file}: ${err.message}`)
  }
}

// Posix paths relative to dir, every file below it, in a stable order.
function listFiles(dir) {
  const out = []
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(abs, entry.name), entryRel)
      else if (entry.isFile()) out.push(entryRel)
    }
  }
  walk(dir, '')
  return out
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

// Replaces each HTML comment's characters with spaces (newlines stay), so a tag inside a comment is no tag and the
// line numbers of the rest do not move.
const maskComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))

const attrValue = (attrs, name) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}
const hasAttr = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?=[\\s=/]|$)`, 'i').test(attrs)

function readManifest(root) {
  const file = path.join(root, 'manifest.js')
  const text = readText(file)
  const window = {}
  try {
    vm.runInNewContext(text, { window }, { filename: 'manifest.js', timeout: 1000 })
  } catch (err) {
    throw new CannotCheck(`manifest.js does not evaluate: ${err.message}`)
  }
  if (!Array.isArray(window.PROTOTYPES)) throw new CannotCheck('manifest.js does not set window.PROTOTYPES to an array')
  return { text, entries: [...window.PROTOTYPES] }
}

// The custom properties that the .css files under _shared/ declare: name -> files (posix, relative to root).
const DECLARATION = /(?<![\w-])(--[\w-]+)\s*:/g
function readSharedTokens(root, files) {
  const tokens = new Map()
  for (const file of files.filter((f) => f.startsWith('_shared/') && f.endsWith('.css'))) {
    for (const m of readText(path.join(root, file)).matchAll(DECLARATION)) {
      if (!tokens.has(m[1])) tokens.set(m[1], new Set())
      tokens.get(m[1]).add(file)
    }
  }
  return tokens
}

// The text of the file's first comment, comment marks and indentation removed, whitespace collapsed; null when the
// file does not open with one. An .html file's is its first <!-- -->, a script's its leading run of // lines or its
// leading /* */.
function firstComment(file, text) {
  if (file.endsWith('.html')) {
    const m = /<!--([\s\S]*?)-->/.exec(text)
    return m ? { line: lineOf(text, m.index), text: m[1].replace(/\s+/g, ' ').trim() } : null
  }
  const lines = text.replace(/^#!.*\n/, '\n').split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (/^\s*\/\//.test(lines[i] ?? '')) {
    const start = i
    while (i < lines.length && /^\s*\/\//.test(lines[i])) i++
    const body = lines.slice(start, i).map((l) => l.replace(/^\s*\/\/+/, ''))
    return { line: start + 1, text: body.join(' ').replace(/\s+/g, ' ').trim() }
  }
  const block = /^\s*\/\*([\s\S]*?)\*\//.exec(lines.slice(i).join('\n'))
  if (block) return { line: i + 1, text: block[1].replace(/^\s*\*+/gm, ' ').replace(/\s+/g, ' ').trim() }
  return null
}

function check(root) {
  let rootStat
  try {
    rootStat = statSync(root)
  } catch {
    throw new CannotCheck(`${root} does not exist`)
  }
  if (!rootStat.isDirectory()) throw new CannotCheck(`${root} is not a folder`)

  const files = listFiles(root)
  const pages = files.filter((f) => f.endsWith('.html') && f !== 'index.html' && !f.startsWith('vendor/'))
  if (pages.length === 0) throw new CannotCheck(`no page found under ${root}`)
  const manifest = readManifest(root)
  const shared = readSharedTokens(root, files)

  const violations = []
  const label = (rel) => {
    const abs = path.join(root, rel)
    const fromRepo = path.relative(REPO_ROOT, abs)
    return (fromRepo.startsWith('..') ? abs : fromRepo).split(path.sep).join('/')
  }
  const report = (rel, line, rule, message) => violations.push({ file: label(rel), line, rule, message })

  // Entries by normalised path; an entry without a usable path is itself reported.
  const manifestLine = (needle) => lineOf(manifest.text, Math.max(0, manifest.text.indexOf(needle)))
  const entryByPath = new Map()
  manifest.entries.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null || typeof entry.path !== 'string' || entry.path === '') {
      report('manifest.js', manifestLine('PROTOTYPES'), 5, `entry ${i + 1} has no path`)
    } else {
      entryByPath.set(path.posix.normalize(entry.path), entry)
    }
  })

  for (const page of pages) {
    const text = readText(path.join(root, page))
    const dir = path.posix.dirname(page)
    const depth = dir === '.' ? 0 : dir.split('/').length
    const prefix = '../'.repeat(depth)
    const pageTag = maskComments(text)

    // Rule 1
    const scripts = [...pageTag.matchAll(/<script\b([^>]*)>/gi)]
      .map((m) => ({ attrs: m[1], line: lineOf(text, m.index), src: attrValue(m[1], 'src') }))
      .filter((s) => s.src !== null)
    INCLUDES.forEach((name, i) => {
      const expected = prefix + name
      if (!scripts[i]) {
        report(page, scripts.length ? scripts[scripts.length - 1].line : 1, 1, `script ${i + 1} is missing, expected ${expected}`)
      } else if (scripts[i].src !== expected) {
        report(page, scripts[i].line, 1, `script ${i + 1} is ${scripts[i].src}, expected ${expected}`)
      }
    })
    if (scripts[3] && !hasAttr(scripts[3].attrs, 'data-follow') && !hasAttr(scripts[3].attrs, 'data-settings')) {
      report(page, scripts[3].line, 1, 'script 4 carries neither data-follow nor data-settings')
    }

    // Rule 2
    text.split('\n').forEach((line, i) => {
      for (const word of FORBIDDEN) if (line.includes(word)) report(page, i + 1, 2, `${word} is forbidden in a page`)
    })

    // Rule 3
    const declared = new Map()
    const note = (map, name, index) => {
      if (!map.has(name)) map.set(name, lineOf(text, index))
    }
    for (const m of text.matchAll(DECLARATION)) note(declared, m[1], m.index)
    for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) note(declared, m[1], m.index)
    const used = new Map()
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) note(used, m[1], m.index)
    const linked = new Set()
    for (const m of pageTag.matchAll(/<link\b([^>]*)>/gi)) {
      const href = attrValue(m[1], 'href')
      if (href && /stylesheet/i.test(attrValue(m[1], 'rel') ?? '')) linked.add(path.posix.normalize(path.posix.join(dir, href)))
    }
    const links = (name) => [...shared.get(name)].some((file) => linked.has(file))
    const own = OWN_TOKENS[page] ?? []
    for (const name of own) {
      if (!declared.has(name) || !shared.has(name)) {
        report(page, 1, 3, `OWN_TOKENS lists ${name} for this page, which ${shared.has(name) ? 'does not declare it' : 'no _shared file declares'}`)
      }
    }
    for (const [name, line] of declared) {
      if (!shared.has(name)) continue
      const files = [...shared.get(name)].join(', ')
      if (!own.includes(name)) report(page, line, 3, `${name} is declared in ${files}; link it and use it, do not declare it again`)
      else if (links(name)) report(page, line, 3, `${name} is the page's own token in OWN_TOKENS, yet the page links ${files}, which declares it`)
    }
    for (const [name, line] of used) {
      if (declared.has(name) || !shared.has(name) || links(name)) continue
      report(page, line, 3, `var(${name}) is declared in ${[...shared.get(name)].join(', ')}, which the page does not link`)
    }

    // Rule 4
    const entry = entryByPath.get(page)
    if (entry && (entry.type === 'ui' || entry.type === 'candidates')) {
      const stem = path.posix.basename(page, '.html')
      const rootTag = /<html[\s>]/i.exec(pageTag)
      const doctype = /<!doctype[^>]*>/i.exec(pageTag)
      const start = doctype ? doctype.index + doctype[0].length : 0
      const header = text.slice(start, rootTag ? rootTag.index : text.length)
      const comments = [...header.matchAll(/<!--([\s\S]*?)-->/g)]
      const want = `Review notes: ${stem}.md`
      const line = comments.length ? lineOf(text, start + comments[0].index) : rootTag ? lineOf(text, rootTag.index) : 1
      if (comments.length !== 1) {
        report(page, line, 4, `expected one header comment (<!-- ${want} -->) between the doctype and the root element, found ${comments.length}`)
      } else if (comments[0][1].trim() !== want || comments[0][1].includes('\n')) {
        report(page, line, 4, `the header comment must be the single line <!-- ${want} -->`)
      }
      if (!files.includes(`${dir === '.' ? '' : `${dir}/`}${stem}.md`)) report(page, line, 4, `${stem}.md does not exist beside the page`)
    }

    // Rule 5: the page's entry
    if (!entry) report(page, 1, 5, 'the page has no entry in manifest.js')
  }

  // Rule 5: the entries
  for (const [entryPath, entry] of entryByPath) {
    const line = manifestLine(entry.path)
    if (!files.includes(entryPath)) report('manifest.js', line, 5, `path ${entry.path} does not exist`)
    const wantsCandidates = path.posix.basename(entryPath).startsWith('candidates-')
    if (wantsCandidates !== (entry.type === 'candidates')) {
      report('manifest.js', line, 5, wantsCandidates ? `${entry.path} starts with candidates-, so its type must be candidates` : `${entry.path} has type candidates, so its file name must start with candidates-`)
    }
  }

  // Rule 6
  for (const file of COPIED_FILES) {
    if (!files.includes(file)) {
      report(file, 1, 6, `${file} is missing; it must carry the marker "${COPY_MARKER}" in its first comment`)
      continue
    }
    const comment = firstComment(file, readText(path.join(root, file)))
    if (!comment) report(file, 1, 6, `no comment opens the file; the marker "${COPY_MARKER}" belongs in its first comment`)
    else if (!comment.text.includes(COPY_MARKER)) report(file, comment.line, 6, `the first comment lacks the marker "${COPY_MARKER}"`)
  }

  violations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.rule - b.rule))
  return { pages: pages.length, violations }
}

function main() {
  try {
    const root = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'docs', 'prototypes'))
    const { pages, violations } = check(root)
    for (const v of violations) console.log(`${v.file}:${v.line}: rule ${v.rule}: ${v.message}`)
    const scope = `${pages} pages, ${RULE_COUNT} rules checked`
    console.log(violations.length === 0 ? `prototype contract: ${scope}, no violation` : `prototype contract: ${violations.length} violation${violations.length === 1 ? '' : 's'} (${scope})`)
    process.exitCode = violations.length === 0 ? 0 : 1
  } catch (err) {
    // Node ends an uncaught error with 1, which would read as "a violation was found"
    console.error(`prototype contract: could not check: ${err instanceof CannotCheck ? err.message : err.stack}`)
    process.exitCode = 2
  }
}

main()
