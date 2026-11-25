// language::REQ-004: every date and time the interface shows follows the system's region format, not the interface language.
// The platform keeps the two apart (the language list and the region are separate settings) and so does this module.

/** A region the way the platform names it: two letters, or three digits (`419`). */
const REGION = /^(?:[A-Za-z]{2}|\d{3})$/

/** The locale `tag` names once canonicalised, or undefined when it is not a well-formed tag. */
function canonical(tag: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch {
    return undefined
  }
}

/**
 * Whether the platform really formats with `locale`: a formatter reports the locale it settled on, and that is a
 * different one (usually the language alone) when it has no data for the region asked for.
 */
function takesEffect(locale: string): boolean {
  return new Intl.DateTimeFormat(locale).resolvedOptions().locale === locale
}

/** The language a region is mostly written in (`US` → `en`, `DE` → `de`), which the region's own format is named after. */
function languageOf(region: string): string | undefined {
  try {
    return new Intl.Locale(`und-${region}`).maximize().language
  } catch {
    return undefined
  }
}

/**
 * The locale to format dates and times with for a `language` and the `region` the system formats them in: the language
 * and region together when the platform has data for that combination (English in Germany reads 24-hour), otherwise the
 * region's own form (Chinese in the US reads as the US does, not as a Chinese 12-hour hybrid the platform cannot produce).
 * Undefined when no locale survives, which leaves the platform's default formatting.
 */
export function regionFormatLocale(language: string, region: string): string | undefined {
  if (!REGION.test(region)) return undefined
  const upper = region.toUpperCase()
  const own = languageOf(upper)
  for (const tag of [`${language}-${upper}`, own === undefined ? '' : `${own}-${upper}`]) {
    const locale = canonical(tag)
    if (locale !== undefined && takesEffect(locale)) return locale
  }
  return undefined
}

/**
 * The locale to format with for the locale tag the system reports (`en-DE`, `zh-Hans-US`; an underscore works as a hyphen):
 * its region is the region the system formats in, its language only a candidate beside it. Undefined when it names no
 * region or no locale can be made of it.
 */
export function regionFormatLocaleOf(systemLocale: string): string | undefined {
  let parsed: Intl.Locale
  try {
    parsed = new Intl.Locale(systemLocale.replace(/_/g, '-'))
  } catch {
    return undefined
  }
  if (parsed.region === undefined) return undefined
  const language = parsed.script === undefined ? parsed.language : `${parsed.language}-${parsed.script}`
  return regionFormatLocale(language, parsed.region)
}

/** The query parameter a window's URL carries the locale in, next to `lang`. */
const PARAM = 'regionFormat'

/**
 * The URL with `locale` as its `regionFormat` query parameter, which a page reads before its first render. An existing one
 * is replaced in place; with no locale the URL carries none, so the page keeps the platform default.
 */
export function withRegionFormat(url: string, locale: string | undefined): string {
  const u = new URL(url)
  if (locale === undefined) u.searchParams.delete(PARAM)
  else u.searchParams.set(PARAM, locale)
  return u.toString()
}

/** The locale a page's query (`location.search`) names, or undefined when it names none or something that is not a tag. */
export function regionFormatFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get(PARAM)
  return value === null || value === '' ? undefined : canonical(value)
}

/** What the interface writes an instant with, in one locale. Built once per page: the locale is fixed for the page's life. */
export type RegionFormats = {
  /** A message's time: hour and minute. */
  time: Intl.DateTimeFormat
  /** A received file's date and time: month, day, hour and minute, in the region's order and on the region's clock. */
  dateTime: Intl.DateTimeFormat
}

/** The formatters for `locale`; no locale means the platform's own default formatting. */
export function regionFormats(locale: string | undefined): RegionFormats {
  return {
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    dateTime: new Intl.DateTimeFormat(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}
