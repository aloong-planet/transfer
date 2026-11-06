// The decisions behind Transfer's Electron security baseline (docs/specs/electron-security.md, ADR-0025), against their
// bypass vectors, and static checks of rules the main process and the renderer must not bypass. The navigation guard, the
// window-open handler, the permission handlers and the IPC check on a foreign page are driven through real windows by
// e2e/electron-security.spec.ts.
//
// Known gap: the renderer scan reads Transfer's own source for a fixed list of sinks. A third-party component that turns
// received text into links or markup is not seen by it; a link it made could still not navigate the window or open one
// (electron-security::CON-001). Check any such component when it is added.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { checkedListener, isAppUrl, isTrustedSender, permissionGranted } from './security'

const DEV = 'http://localhost:5173/'

describe("the origin rule: is this one of Transfer's own pages (electron-security::CON-001)", () => {
  // The scheme is read without regard to case
  it.each(['app://bundle/index.html', 'app://bundle/overlay.html', 'app://bundle/', 'app://bundle', 'APP://bundle/index.html'])(
    'accepts Transfer\'s own page in a packaged build: %s',
    (url) => {
      expect(isAppUrl(url)).toBe(true)
    }
  )

  it.each([
    'app://bundle.evil/',
    'app://evil/',
    'app://bundle@evil/',
    'app://evil@bundle/',
    'app://user:pass@bundle/',
    'file:///Users/a/evil.html',
    'http://bundle/',
    'https://bundle/',
    'data:text/html,<p>x</p>',
    'javascript:alert(1)',
    'about:blank',
    '',
    'not a url',
    // an app: host keeps its case and is compared exactly
    'app://BUNDLE/index.html'
  ])('refuses anything else in a packaged build, however it starts: %s', (url) => {
    expect(isAppUrl(url)).toBe(false)
  })

  it.each(['http://localhost:5173/', 'http://localhost:5173/overlay.html', 'http://LOCALHOST:5173/', 'HTTP://localhost:5173/overlay.html'])(
    'accepts the development server\'s pages from source, by origin, in any case: %s',
    (url) => {
      expect(isAppUrl(url, DEV)).toBe(true)
    }
  )

  it.each(['http://localhost:5173.evil.com/', 'http://localhost:5174/', 'https://localhost:5173/', 'http://evil@localhost:5173/', 'app://bundle/index.html'])(
    'refuses what only resembles the development server from source: %s',
    (url) => {
      expect(isAppUrl(url, DEV)).toBe(false)
    }
  )
})

describe('the permission decision (electron-security::CON-004)', () => {
  it("grants clipboard writing to Transfer's own pages", () => {
    expect(permissionGranted('clipboard-sanitized-write', 'app://bundle/overlay.html')).toBe(true)
    expect(permissionGranted('clipboard-sanitized-write', 'http://localhost:5173/', DEV)).toBe(true)
  })

  it('refuses clipboard writing to any other page', () => {
    expect(permissionGranted('clipboard-sanitized-write', 'http://127.0.0.1:9/')).toBe(false)
  })

  it.each(['media', 'notifications', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen', 'unknown'])(
    "refuses every other permission, even to Transfer's own pages: %s",
    (permission) => {
      expect(permissionGranted(permission, 'app://bundle/index.html')).toBe(false)
    }
  )
})

describe('the IPC sender decision (electron-security::CON-003/AC-02)', () => {
  it("trusts a main frame on Transfer's own page", () => {
    expect(isTrustedSender({ url: 'app://bundle/index.html', isMainFrame: true })).toBe(true)
    expect(isTrustedSender({ url: 'http://localhost:5173/', isMainFrame: true }, DEV)).toBe(true)
  })

  it("refuses a subframe, even on Transfer's own page", () => {
    expect(isTrustedSender({ url: 'app://bundle/index.html', isMainFrame: false })).toBe(false)
  })

  it.each(['file:///Users/a/evil.html', 'http://127.0.0.1:9/', 'about:blank'])('refuses a main frame on any other page: %s', (url) => {
    expect(isTrustedSender({ url, isMainFrame: true })).toBe(false)
  })

  it('refuses a call whose frame is already gone', () => {
    expect(isTrustedSender(null)).toBe(false)
  })
})

describe('the check around every IPC handler (electron-security::CON-003/AC-02)', () => {
  it("runs the handler for Transfer's own main frame, with the call's event and arguments, and returns its result", () => {
    const handler = (event: { senderFrame: { url: string } | null }, a: number, b: string) => [event.senderFrame?.url, a, b]
    expect(checkedListener('get-identity', handler)({ senderFrame: { url: 'app://bundle/index.html', parent: null } }, 1, 'two')).toEqual([
      'app://bundle/index.html',
      1,
      'two'
    ])
  })

  it('in a run from source, runs the handler for a main frame on the development server', () => {
    const answer = checkedListener('get-identity', () => 'answered', DEV)
    expect(answer({ senderFrame: { url: 'http://localhost:5173/', parent: null } })).toBe('answered')
  })

  it.each([
    ["a subframe on Transfer's own page", { url: 'app://bundle/index.html', parent: { url: 'app://bundle/index.html' } }],
    ['a main frame on another page', { url: 'file:///Users/a/evil.html', parent: null }],
    ['a frame that is already gone', null]
  ])('refuses %s with an error, and never runs the handler', (_name, senderFrame) => {
    let ran = false
    const answer = checkedListener('send-text', () => {
      ran = true
    })
    expect(() => answer({ senderFrame })).toThrow('Transfer refused an IPC call on send-text')
    expect(ran).toBe(false)
  })
})

/** Every source file of the main process, tests excluded, by path relative to src/main */
function mainSources(): Array<{ path: string; text: string }> {
  const root = new URL('.', import.meta.url).pathname
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.fixture.ts'))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }))
}

const REGISTERING_METHODS = new Set(['handle', 'handleOnce', 'on', 'once', 'addListener', 'prependListener', 'prependOnceListener'])

/**
 * Every call in a source that registers for messages from a page — `ipcMain.<method>(`, `<x>.ipc.<method>(`, or a listener
 * for a web contents' `'ipc-message'` / `'ipc-message-sync'` — and whether the function it hands Electron is the result
 * of `checkedListener(…)`, whose check runs before the handler (the cases above). Anything else counts as unchecked.
 */
function ipcRegistrations(text: string): Array<{ call: string; checked: boolean }> {
  const file = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true)
  const found: Array<{ call: string; checked: boolean }> = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && REGISTERING_METHODS.has(node.expression.name.text)) {
      const target = node.expression.expression
      const onIpc =
        (ts.isIdentifier(target) && target.text === 'ipcMain') || (ts.isPropertyAccessExpression(target) && target.name.text === 'ipc')
      const first = node.arguments[0]
      const ipcEvent = first !== undefined && ts.isStringLiteralLike(first) && /^ipc-message(-sync)?$/.test(first.text)
      if (onIpc || ipcEvent) {
        const listener = node.arguments[node.arguments.length - 1]
        const wrapped =
          listener !== undefined &&
          ts.isCallExpression(listener) &&
          ts.isIdentifier(listener.expression) &&
          listener.expression.text === 'checkedListener'
        found.push({ call: node.expression.getText(file), checked: wrapped })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

describe('the wiring the main process may not bypass', () => {
  it('registers IPC handlers only in the wrapper module, in every form Electron offers (electron-security::CON-003/AC-01)', () => {
    const sources = mainSources()
    expect(sources.length).toBeGreaterThan(10)
    // ipcMain and a web contents' own ipc object take the same listeners; a web contents also emits what a page sends
    const registration =
      /(ipcMain|\.ipc)\.(handle|handleOnce|on|once|addListener|prependListener|prependOnceListener)\(|['"]ipc-message(-sync)?['"]/
    const direct = sources.filter(({ path, text }) => path !== 'web-guards.ts' && registration.test(text))
    expect(direct.map(({ path }) => path)).toEqual([])
  })

  it('wraps every registration in the wrapper module in the sender check (electron-security::CON-003/AC-01)', () => {
    const found = ipcRegistrations(readFileSync(join(new URL('.', import.meta.url).pathname, 'web-guards.ts'), 'utf8'))
    expect(found.length).toBeGreaterThan(0)
    expect(found.filter(({ checked }) => !checked).map(({ call }) => call)).toEqual([])
  })

  it('creates no window with its sandbox or Node integration switched on the wrong way (electron-security::CON-005)', () => {
    const offending = mainSources().filter(({ text }) => /sandbox:\s*false|nodeIntegration:\s*true/.test(text))
    expect(offending.map(({ path }) => path)).toEqual([])
  })
})

describe('what the renderer shows of another device\'s content', () => {
  it('has none of the raw-markup or embedding sinks in its own code', () => {
    const root = new URL('../renderer/', import.meta.url).pathname
    const sources = (readdirSync(root, { recursive: true }) as string[])
      .filter((path) => /\.(ts|tsx|html)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }))
    expect(sources.length).toBeGreaterThan(5)
    const sink = /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write\(|<a[\s>]|<iframe|<object|<embed|<webview/
    expect(sources.filter(({ text }) => sink.test(text)).map(({ path }) => path)).toEqual([])
  })
})
