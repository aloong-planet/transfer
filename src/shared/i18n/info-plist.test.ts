import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { DICT } from './dict'
import { LPROJ_NAMES, infoPlistStringsFiles } from './info-plist'

// A dictionary whose Info.plist text is told apart by language; every other key is irrelevant to the function
function dictWith(zh: string, en: string): typeof DICT {
  return {
    zh: { ...DICT.zh, 'infoPlist.localNetworkUsage': zh },
    en: { ...DICT.en, 'infoPlist.localNetworkUsage': en }
  }
}

// The text of a generated file without its leading "generated, do not edit" comment
const entries = (content: string): string => content.replace(/^\/\*[\s\S]*?\*\/\n/, '')

const FILE = (lproj: string): string => `${lproj}.lproj/InfoPlist.strings`

// The files electron-builder ships (`extraResources` in electron-builder.yml), as committed; dot files are the
// system's own (.DS_Store), not part of the set
const COMMITTED_DIR = new URL('../../../build/info-plist/', import.meta.url)
function committedFiles(): Map<string, string> {
  const files = new Map<string, string>()
  for (const name of readdirSync(COMMITTED_DIR, { recursive: true, encoding: 'utf8' })) {
    if (name.split('/').some((part) => part.startsWith('.'))) continue
    const url = new URL(name, COMMITTED_DIR)
    if (statSync(url).isFile()) files.set(name, readFileSync(url, 'utf8'))
  }
  return files
}

// language::REQ-003/AC-04
describe('the InfoPlist.strings files generated from the dictionary', () => {
  test('every language the dictionary has gets a folder of its own, and no language the dictionary lacks does', () => {
    expect(Object.keys(LPROJ_NAMES).sort()).toEqual(Object.keys(DICT).sort())
    const folders = Object.values(LPROJ_NAMES).flat()
    expect(folders.length).toBeGreaterThan(0)
    // Two languages sharing a folder name would make one overwrite the other
    expect(new Set(folders).size).toBe(folders.length)
  })

  test('the folders are named after what macOS matches: English, Simplified Chinese and Traditional Chinese', () => {
    // Measured on macOS 26.0.1: a lone zh.lproj shows Chinese to Simplified systems only, and leaves zh-Hant
    // and zh-HK systems in English; zh_CN is the folder Electron already ships, so it is reused, not doubled
    const files = infoPlistStringsFiles(dictWith('ZH text', 'EN text'))
    expect([...files.keys()].sort()).toEqual([FILE('en'), FILE('zh-Hant'), FILE('zh_CN')])
  })

  test('each folder holds its language\'s text as the one key the usage prompt reads', () => {
    const files = infoPlistStringsFiles(dictWith('ZH text', 'EN text'))
    expect(entries(files.get(FILE('en')) as string)).toBe('"NSLocalNetworkUsageDescription" = "EN text";\n')
    expect(entries(files.get(FILE('zh_CN')) as string)).toBe('"NSLocalNetworkUsageDescription" = "ZH text";\n')
    expect(entries(files.get(FILE('zh-Hant')) as string)).toBe('"NSLocalNetworkUsageDescription" = "ZH text";\n')
  })

  test('each file says it is generated, so nobody edits it by hand', () => {
    const files = infoPlistStringsFiles(dictWith('ZH text', 'EN text'))
    expect(files.size).toBeGreaterThan(0)
    for (const [name, content] of files) {
      expect(content, name).toMatch(/^\/\* .*do not edit.*\*\/\n/i)
    }
  })

  test('a quote, a backslash and a line break in a text are escaped so the file reads back as the same text', () => {
    const text = 'a "quoted" word, a back\\slash\nand a second line'
    const files = infoPlistStringsFiles(dictWith(text, text))
    expect(files.size).toBeGreaterThan(0)
    for (const [name, content] of files) {
      expect(entries(content), name).toBe(
        String.raw`"NSLocalNetworkUsageDescription" = "a \"quoted\" word, a back\\slash\nand a second line";` + '\n'
      )
    }
  })
})

// language::REQ-003/AC-04
describe('build/info-plist, which the packages ship, matches the dictionary (fix: pnpm gen:info-plist)', () => {
  test('it holds exactly the generated files: none missing, none left over from a removed language', () => {
    expect([...committedFiles().keys()].sort()).toEqual([...infoPlistStringsFiles(DICT).keys()].sort())
  })

  test('each file has the generated content: a changed dictionary text fails until the files are regenerated', () => {
    const generated = infoPlistStringsFiles(DICT)
    const committed = committedFiles()
    expect(generated.size).toBeGreaterThan(0)
    for (const [name, content] of generated) {
      expect(committed.get(name), name).toBe(content)
    }
  })
})
