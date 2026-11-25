import { describe, expect, test } from 'vitest'
import { withLang } from './lang-query'

// The URL a window is loaded from names the language in force, so its first frame is drawn in it (language::REQ-003/AC-02).
describe('withLang', () => {
  test.each([
    ['a packaged page', 'app://bundle/index.html', 'en', 'app://bundle/index.html?lang=en'],
    ['a packaged page in Chinese', 'app://bundle/index.html', 'zh', 'app://bundle/index.html?lang=zh'],
    ['the development server root', 'http://localhost:5173', 'zh', 'http://localhost:5173/?lang=zh'],
    [
      'a URL that already names a language, which is replaced once and leaves the rest alone',
      'app://bundle/index.html?lang=zh&x=1#h',
      'en',
      'app://bundle/index.html?lang=en&x=1#h'
    ]
  ] as const)('puts the language on %s', (_name, url, lang, expected) => {
    expect(withLang(url, lang)).toBe(expected)
  })
})
