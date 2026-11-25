import { describe, expect, test } from 'vitest'
import {
  regionFormatFromSearch,
  regionFormatLocale,
  regionFormatLocaleOf,
  regionFormats,
  withRegionFormat
} from './region-format'

// language::REQ-004/AC-01, language::REQ-004/AC-04
//
// The pairs are deliberately mismatched where it matters: the language is the one the interface may be in, the region is
// the one the system formats dates and times in, and the platform silently drops a region it has no data for with that
// language. So every expectation below is the locale that took effect when read back from the formatter, never only the
// string that was asked for.
const PAIRS = [
  ['English with the German region', 'en', 'DE', 'en-DE', 'h23'],
  ['Chinese with the US region, which the platform has no data for, so the region speaks for itself', 'zh-Hans', 'US', 'en-US', 'h12'],
  ['English with the US region, the control', 'en', 'US', 'en-US', 'h12']
] as const

describe('regionFormatLocale', () => {
  test.each(PAIRS)('%s', (_name, language, region, expected, hourCycle) => {
    const locale = regionFormatLocale(language, region)

    expect(locale).toBe(expected)
    // The locale the formatter really used is the one handed back, not a fallback it picked silently.
    expect(new Intl.DateTimeFormat(locale).resolvedOptions().locale).toBe(locale)
    // The clock is the region's: German region 24-hour even in English, US region 12-hour even in Chinese.
    expect(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle).toBe(hourCycle)
  })

  // A locale that took effect still has to show the moment itself: the hour and minute a formatter writes are the local
  // ones whichever clock it writes them on. 00:05 is in because a 12-hour clock writes it as 12:05 AM.
  test.each(PAIRS)('%s: writes the moment\'s own local hour and minute', (_name, language, region) => {
    const locale = regionFormatLocale(language, region)

    for (const moment of [new Date(2026, 10, 25, 21, 30), new Date(2026, 10, 25, 0, 5)]) {
      const parts = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).formatToParts(moment)
      const part = (type: string): string | undefined => parts.find((p) => p.type === type)?.value
      const period = part('dayPeriod')
      const written = Number(part('hour'))
      const hour24 = period === undefined ? written : (written % 12) + (period === 'PM' ? 12 : 0)

      expect({ hour: hour24, minute: Number(part('minute')) }).toEqual({
        hour: moment.getHours(),
        minute: moment.getMinutes()
      })
    }
  })

  // The platform default is what is left when the region cannot be used: nothing here may invent a format.
  test.each([
    ['a region the platform has no data for', 'en', 'ZZ'],
    ['no region at all', 'en', ''],
    ['something that is not a region', 'en', 'Germany']
  ] as const)('has no locale for %s', (_name, language, region) => {
    expect(regionFormatLocale(language, region)).toBeUndefined()
  })
})

// language::REQ-004/AC-01, language::REQ-004/AC-04
//
// The system reports one locale tag, the language and the region it formats in together; some platforms write it with an
// underscore. Whatever it reports, the region is taken from it and the language beside it is only a candidate.
describe('regionFormatLocaleOf', () => {
  test.each([
    ['a language and the German region', 'en-DE', 'en-DE'],
    ['the same with an underscore', 'en_DE', 'en-DE'],
    ['a region written in its own language', 'de-DE', 'de-DE'],
    ['Chinese with a script and the US region, which the platform has no data for', 'zh-Hans-US', 'en-US']
  ] as const)('reads %s', (_name, systemLocale, expected) => {
    expect(regionFormatLocaleOf(systemLocale)).toBe(expected)
  })

  test.each([
    ['a language alone', 'en'],
    ['an empty report', ''],
    ['something that is not a locale tag', 'not a locale']
  ] as const)('has no locale for %s', (_name, systemLocale) => {
    expect(regionFormatLocaleOf(systemLocale)).toBeUndefined()
  })
})

// language::REQ-004/AC-02
//
// The two places that write an instant: a message's time, and a received file's date and time (month, day, hour, minute,
// no year). The expected texts were read from the platform's own formatter for those locales, not derived from the code.
describe('regionFormats', () => {
  const evening = new Date(2026, 10, 25, 21, 30).getTime()

  test.each([
    ['the German region in English: 24-hour, day before month', 'en-DE', '21:30', '25/11, 21:30'],
    ['the US region: 12-hour, month before day', 'en-US', '09:30 PM', '11/25, 09:30 PM']
  ] as const)('writes %s', (_name, locale, time, dateTime) => {
    const formats = regionFormats(locale)

    expect(formats.time(evening)).toBe(time)
    expect(formats.dateTime(evening)).toBe(dateTime)
  })
})

// language::REQ-004/AC-03
//
// The locale reaches a window in its URL, next to the language, so the first frame already has it; a page that is reloaded
// reads it from the URL it was given.
describe('the region format in a window URL', () => {
  test.each([
    ['a packaged page', 'app://bundle/index.html?lang=en', 'app://bundle/index.html?lang=en&regionFormat=en-DE'],
    [
      'a URL that already names one, which is replaced once and leaves the rest alone',
      'app://bundle/index.html?regionFormat=en-US&lang=zh#h',
      'app://bundle/index.html?regionFormat=en-DE&lang=zh#h'
    ]
  ] as const)('puts it on %s and reads it back', (_name, url, expected) => {
    const withIt = withRegionFormat(url, 'en-DE')

    expect(withIt).toBe(expected)
    expect(regionFormatFromSearch(new URL(withIt).search)).toBe('en-DE')
  })

  test('leaves a URL without one alone when there is no locale, and clears an old one', () => {
    expect(withRegionFormat('app://bundle/index.html?lang=en', undefined)).toBe('app://bundle/index.html?lang=en')
    expect(withRegionFormat('app://bundle/index.html?lang=en&regionFormat=en-DE', undefined)).toBe(
      'app://bundle/index.html?lang=en'
    )
  })

  test.each([
    ['no parameter', '?lang=en'],
    ['an empty one', '?regionFormat='],
    ['something that is not a locale tag', '?regionFormat=not%20a%20locale'],
    ['a stray character', '?regionFormat=en-DE%00']
  ] as const)('ignores %s', (_name, search) => {
    expect(regionFormatFromSearch(search)).toBeUndefined()
  })
})
