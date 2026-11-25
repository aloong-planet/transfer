// What macOS reads from the app bundle instead of the renderer or the main process: user-visible Info.plist text,
// which the system picks by ITS language, not Transfer's (language::REQ-003/AC-04). The text lives in the dictionary
// like all other copy; scripts/gen-info-plist-strings.mjs turns it into build/info-plist/<folder>/InfoPlist.strings,
// which electron-builder ships into Contents/Resources. Types only are imported, so Node can load this unbuilt.
import type { TKey } from './dict'
import type { Lang } from './t'

/** Info.plist key whose user-visible text is localized -> the dictionary key that holds the text */
export const INFO_PLIST_KEYS = {
  NSLocalNetworkUsageDescription: 'infoPlist.localNetworkUsage'
} as const satisfies Record<string, TKey>

/**
 * The `<name>.lproj` folders each language is shipped as. macOS picks a folder by walking the system's preferred
 * languages; the names are what it matches against, measured on macOS 26.0.1 with a bundle of the same shape:
 *   - `zh.lproj` alone is Chinese for Simplified systems only; zh-Hant, zh-TW and zh-HK systems get the base text
 *   - `zh_CN` + `zh-Hant` is Chinese for zh-Hans, zh-Hant, zh-HK, zh-TW, zh-MO and zh-SG alike
 * `zh_CN` is the folder Electron already ships (`electronLanguages` in electron-builder.yml, empty there), so it is
 * reused rather than adding `zh-Hans` next to it, which would make both match a Simplified system.
 * Every folder is also a locale to Chromium: with `zh-Hant`, a zh-Hant, zh-TW, zh-HK or zh-MO system's renderer
 * formats in zh-Hant instead of the en-US fallback (`toLocaleTimeString([])` gives 下午09:30, not 09:30 PM), as a
 * Simplified system's already does through `zh_CN` (21:30).
 */
export const LPROJ_NAMES: Record<Lang, readonly string[]> = {
  en: ['en'],
  zh: ['zh_CN', 'zh-Hant']
}

/** A string in `.strings` syntax: quote, backslash and line break escaped, so the file reads back as the same text */
function stringsLiteral(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/** Every InfoPlist.strings file of the bundle, as `<folder>.lproj/InfoPlist.strings` -> its content */
export function infoPlistStringsFiles(dict: Record<Lang, Record<TKey, string>>): Map<string, string> {
  const files = new Map<string, string>()
  for (const lang of Object.keys(LPROJ_NAMES) as Lang[]) {
    const entries = Object.entries(INFO_PLIST_KEYS).map(
      ([plistKey, dictKey]) => `${stringsLiteral(plistKey)} = ${stringsLiteral(dict[lang][dictKey])};\n`
    )
    const content =
      '/* Generated from src/shared/i18n/dict.ts by scripts/gen-info-plist-strings.mjs (pnpm gen:info-plist). Do not edit. */\n' +
      entries.join('')
    for (const folder of LPROJ_NAMES[lang]) files.set(`${folder}.lproj/InfoPlist.strings`, content)
  }
  return files
}
