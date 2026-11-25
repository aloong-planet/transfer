import { describe, expect, test } from 'vitest'
import { htmlLang } from './html-lang'

// language::REQ-003/AC-03
describe('htmlLang', () => {
  test.each([
    ['Chinese, which is Simplified Chinese here', 'zh', 'zh-Hans'],
    ['English', 'en', 'en']
  ] as const)('names %s by its BCP 47 tag', (_name, lang, tag) => {
    expect(htmlLang(lang)).toBe(tag)
  })
})
