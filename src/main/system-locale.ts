// What the system reports about the user's languages and region, read in one place so a test can stand in for it.
//
// The two are separate settings and are read through separate calls: the language list (in the user's order of
// preference) picks the interface language, the locale tag carries the region the system formats dates and times in
// (language::REQ-004). Both calls need the app to be ready.
//
// Test seams, both environment variables named TRANSFER_* (which a packaged build refuses by prefix, ADR-0024):
// - TRANSFER_SYSTEM_LANGUAGES: a comma-separated list that stands in for the language list.
// - TRANSFER_SYSTEM_LOCALE: a locale tag that stands in for the system's locale (`en-DE`).
// Unset, the real system is read; set to an empty string, the system is taken to report nothing.

import { app } from 'electron'

/** The system's languages, most preferred first, such as `['en-US', 'zh-Hans-CN']` */
export function systemLanguages(): string[] {
  const seam = process.env['TRANSFER_SYSTEM_LANGUAGES']
  if (seam === undefined) return app.getPreferredSystemLanguages()
  return seam
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
}

/** The system's locale tag, the language and the region it formats dates and times in together, such as `en-DE` */
export function systemLocale(): string {
  return process.env['TRANSFER_SYSTEM_LOCALE'] ?? app.getSystemLocale()
}
