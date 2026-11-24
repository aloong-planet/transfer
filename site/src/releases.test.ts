// Which release the download section can offer, from the two places that say so: the latest-release pointer on the
// download host and GitHub's public releases list (landing-page::REQ-002, landing-page failures A1 and A2).
//
// Both answers are outside data (landing-page failure E1), so these tests feed the readers the shapes the real
// answers have: src/fixtures/latest.json is the pointer as the release workflow wrote it for 1.2.3, and
// src/fixtures/github-releases.json is the releases list GitHub returned for this repository, cut to a few
// releases (the pre-release, and releases from before the current file names, are kept). The releases the tests add
// to it are copies of its newest release with the fields that matter to the test changed.
import { afterEach, describe, expect, test, vi } from 'vitest'
import latestSample from './fixtures/latest.json'
import releasesSample from './fixtures/github-releases.json'
import { parsePointer, parseReleases, readGitHub, readPointer, type Fetch } from './releases'

const sample = latestSample as { version: string; releasedAt: string; files: { name: string }[] }
const sampleNames = sample.files.map((file) => file.name)
const withFiles = (files: unknown): unknown => ({ ...sample, files })

type Release = (typeof releasesSample)[number]
const [newest] = releasesSample

/** A release like the newest one in the sample, under another version and publish time, with the given changes */
function releaseOf(version: string, publishedAt: string, changes: Partial<Release> = {}): Release {
  return {
    ...newest,
    tag_name: `v${version}`,
    name: `v${version}-release`,
    published_at: publishedAt,
    created_at: publishedAt,
    assets: newest.assets.map((asset) => ({ ...asset, name: asset.name.replace('1.2.3', version) })),
    ...changes,
  }
}
const NEWER = '2026-12-01T00:00:00Z'
const oldest = releasesSample.find((release) => release.tag_name === 'v0.5.5')!
const beforeCurrentNames = releasesSample.find((release) => release.tag_name === 'v0.7.1')!
const preRelease = releasesSample.find((release) => release.prerelease)!

/** A network that answers every request the same way */
const answer =
  (status: number, body: string): Fetch =>
  () =>
    Promise.resolve(new Response(body, { status }))

/** What the download host answers for a file it does not have: a 404 with an HTML page */
const NOT_FOUND_PAGE = '<!doctype html>\n<html lang="en"><head><title>Not Found</title></head><body></body></html>\n'

/** What GitHub answers an unauthenticated client that has used up its hourly requests */
const RATE_LIMITED = JSON.stringify({
  message: 'API rate limit exceeded for 203.0.113.7. (But here is the good news: Authenticated requests get a higher rate limit.)',
  documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
})

/** A network that never answers, but lets the request be abandoned, as a browser's fetch does */
const silence = (): { fetch: Fetch; aborted: () => boolean } => {
  let aborted = false
  const fetch: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  return { fetch, aborted: () => aborted }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the latest-release pointer', () => {
  test('the pointer as the release workflow writes it gives its version', () => {
    expect(parsePointer(sample)).toBe('1.2.3')
  })

  test('a version the build has never seen is offered as it is (landing-page::REQ-002/AC-05)', () => {
    const unseen = JSON.parse(JSON.stringify(sample).replaceAll('1.2.3', '9.9.9')) as unknown
    expect(parsePointer(unseen)).toBe('9.9.9')
  })

  test('entries and fields beyond the five files are ignored, and so are entries that are not files', () => {
    const body = withFiles([
      null,
      7,
      'Transfer-1.2.3-mac-arm64.dmg',
      { name: 5 },
      { size: 1 },
      { name: 'latest-mac.yml', size: 10, os: 'mac', arch: 'arm64' },
      ...sampleNames.map((name) => ({ name })),
    ])
    expect(parsePointer({ ...(body as object), releasedAt: 7, extra: { nested: true } })).toBe('1.2.3')
  })

  describe('a pointer that is not usable is passed over whole', () => {
    test.each([
      ['null', null],
      ['a string', '1.2.3'],
      ['a number', 123],
      ['an array', [sample]],
      ['a missing version', { files: sample.files }],
      ['a numeric version', { ...sample, version: 123 }],
      ['a version with two parts', { ...sample, version: '1.2' }],
      ['a version with four parts', { ...sample, version: '1.2.3.4' }],
      ['a version with a v prefix', { ...sample, version: 'v1.2.3' }],
      ['a pre-release version', { ...sample, version: '1.2.3-beta' }],
      ['a version with a trailing newline', { ...sample, version: '1.2.3\n' }],
      ['a version carrying markup', { ...sample, version: '1.2.3<img src=x>' }],
      ['no files', { version: sample.version }],
      ['files that are not an array', withFiles({ ...sample.files })],
      ['an empty file list', withFiles([])],
      ['files that all belong to another version', withFiles(sampleNames.map((name) => ({ name: name.replace('1.2.3', '1.2.2') })))],
      ['a file under a path', withFiles([{ name: `x/${sampleNames[0]}` }, ...sample.files.slice(1)])],
    ])('%s', (_, body) => {
      expect(parsePointer(body)).toBeNull()
    })

    test.each(sampleNames)('%s missing from the list, though the other four are there', (missing) => {
      expect(parsePointer(withFiles(sample.files.filter((file) => file.name !== missing)))).toBeNull()
    })
  })
})

describe('the releases GitHub lists', () => {
  test('the list as GitHub returns it gives the newest formal release', () => {
    expect(parseReleases(releasesSample)).toBe('1.2.3')
  })

  test('a version the build has never seen is offered as it is (landing-page::REQ-002/AC-05)', () => {
    expect(parseReleases([releaseOf('9.9.9', NEWER), ...releasesSample])).toBe('9.9.9')
  })

  test.each([
    ['as listed', releasesSample],
    ['reversed', [...releasesSample].reverse()],
    ['with the newest in the middle', [oldest, preRelease, newest, beforeCurrentNames]],
  ])('the newest is picked by publish date, whatever order the list comes in: %s', (_, list) => {
    expect(parseReleases(list)).toBe('1.2.3')
  })

  // In the sample the two dates order the releases alike, so a release has to be built to tell them apart
  test.each([
    ['published later than the newest one but created earlier is the newest', [releaseOf('1.3.0', NEWER, { created_at: '2020-01-01T00:00:00Z' }), ...releasesSample], '1.3.0'],
    ['created later than the newest one but published earlier is not the newest', [releaseOf('1.1.9', '2020-01-01T00:00:00Z', { created_at: NEWER }), ...releasesSample], '1.2.3'],
  ])('the newest is the one published last, not the one created last: a release %s', (_, list, expected) => {
    expect(parseReleases(list)).toBe(expected)
  })

  test.each([
    ['a draft', releaseOf('1.3.0', NEWER, { draft: true })],
    ['a pre-release flagged as one, under a plain tag', releaseOf('1.3.0', NEWER, { prerelease: true })],
    ['a pre-release under a tag with a suffix', releaseOf('1.3.0-rc1', NEWER)],
    ['a release whose tag has no v', releaseOf('1.3.0', NEWER, { tag_name: '1.3.0' })],
    ['a release whose tag carries markup', releaseOf('1.3.0', NEWER, { tag_name: 'v1.3.0<img src=x>' })],
  ])('a newer release that is %s is not offered', (_, extra) => {
    expect(parseReleases([extra, ...releasesSample])).toBe('1.2.3')
  })

  test.each([
    ['one of the five files is not there', releaseOf('1.3.0', NEWER, { assets: newest.assets.slice(1) })],
    [
      'one of the files has not finished uploading',
      releaseOf('1.3.0', NEWER, { assets: newest.assets.map((asset, i) => ({ ...asset, name: asset.name.replace('1.2.3', '1.3.0'), state: i === 0 ? 'open' : 'uploaded' })) }),
    ],
    ['its files carry another version', releaseOf('1.3.0', NEWER, { assets: newest.assets })],
  ])('when the newest formal release has an incomplete set (%s), nothing is offered, not an older release', (_, incomplete) => {
    expect(parseReleases([incomplete, ...releasesSample])).toBeNull()
  })

  test('a release named as releases were before the current file names is not offered', () => {
    expect(parseReleases([beforeCurrentNames])).toBeNull()
  })

  test.each([
    ['an empty list', []],
    ['only a pre-release', [preRelease]],
    ['only drafts', [releaseOf('1.3.0', NEWER, { draft: true })]],
    ['the answer to a rate-limited request', JSON.parse(RATE_LIMITED) as unknown],
    ['a string', 'v1.2.3'],
    ['null', null],
  ])('no formal release to offer: %s', (_, body) => {
    expect(parseReleases(body)).toBeNull()
  })

  test('entries that are not releases of this kind are passed over, and the releases among them still count', () => {
    const junk = [
      null,
      7,
      'v1.2.3',
      { tag_name: 5 },
      { draft: false, prerelease: false, tag_name: 'v9.9.9' },
      releaseOf('9.9.9', 'not a date'),
    ]
    expect(parseReleases([...junk, ...releasesSample])).toBe('1.2.3')
  })
})

const readers = [
  ['pointer', readPointer, JSON.stringify(sample), 'https://dl.aloongplanet.com/latest.json'],
  ['GitHub list', readGitHub, JSON.stringify(releasesSample), 'https://api.github.com/repos/aloong-planet/transfer/releases?per_page=100'],
] as const

describe.each(readers)('reading the %s', (_, read, body, url) => {
  test('asks the one place for what it holds and gives the version it names', async () => {
    const asked: string[] = []
    const fetch: Fetch = (requested) => {
      asked.push(requested)
      return Promise.resolve(new Response(body, { status: 200 }))
    }
    expect(await read(fetch)).toBe('1.2.3')
    expect(asked).toEqual([url])
  })

  test.each([
    ['a 404 with an HTML page', answer(404, NOT_FOUND_PAGE)],
    ['a rate-limited client: a 403 with the rate-limit message', answer(403, RATE_LIMITED)],
    ['a server error', answer(500, body)],
    ['an answer that is not JSON', answer(200, NOT_FOUND_PAGE)],
    ['a request that fails (blocked cross-origin, offline)', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['an answer with nothing usable in it', answer(200, '{}')],
  ])('%s: nothing offered', async (__, fetch) => {
    expect(await read(fetch)).toBeNull()
  })

  test('adds no request header that would make the browser send a CORS preflight', async () => {
    const sent: HeadersInit[] = []
    const fetch: Fetch = (_url, init) => {
      if (init?.headers) sent.push(init.headers)
      return Promise.resolve(new Response(body, { status: 200 }))
    }
    await read(fetch)
    const safelisted = ['accept', 'accept-language', 'content-language']
    const names = sent.flatMap((headers) => [...new Headers(headers).keys()])
    expect(names.filter((name) => !safelisted.includes(name))).toEqual([])
  })

  test('gives up after five seconds, abandoning the request', async () => {
    vi.useFakeTimers()
    const network = silence()
    let result: string | null | undefined
    void read(network.fetch).then((version) => {
      result = version
    })
    await vi.advanceTimersByTimeAsync(4999)
    expect(result).toBeUndefined()
    expect(network.aborted()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toBeNull()
    expect(network.aborted()).toBe(true)
  })
})
