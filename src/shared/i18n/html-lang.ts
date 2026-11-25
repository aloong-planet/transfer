import type { Lang } from './t'

/** The BCP 47 tag a page declares on its `<html>` element for each language in force; the interface's Chinese is Simplified */
const HTML_LANG: Record<Lang, 'zh-Hans' | 'en'> = { zh: 'zh-Hans', en: 'en' }

export function htmlLang(lang: Lang): 'zh-Hans' | 'en' {
  return HTML_LANG[lang]
}
