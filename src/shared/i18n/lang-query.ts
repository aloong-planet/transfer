import type { Lang } from './t'

/**
 * The URL with the language in force as its `lang` query parameter, which a page reads before its first render. An existing
 * `lang` is replaced in place, so a window's URL names one language however often it changes.
 */
export function withLang(url: string, lang: Lang): string {
  const u = new URL(url)
  u.searchParams.set('lang', lang)
  return u.toString()
}
