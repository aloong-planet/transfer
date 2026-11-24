// What the page may take from the two places that name the current release (landing-page::REQ-002): the latest-release
// pointer on the download host and GitHub's public releases list for this repository.
//
// Both answers are outside data (landing-page failure E1). Only a validated version comes out of them: it is
// accepted when it is a plain `major.minor.patch` and the release has all five files under exactly the names the
// release build gives that version. Nothing else of an answer (other names, URLs, release notes) is kept, and every
// link is built later from the version and the page's own constants.
import { LATEST_POINTER_URL, RELEASES_API_URL, VARIANTS } from './download-config'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** How long a read may take before the page stops waiting for it (landing-page failures A1 and A2) */
const TIMEOUT_MS = 5000

const FORMAL_VERSION = /^\d+\.\d+\.\d+$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The five file names of a version */
function fileNames(version: string): string[] {
  return VARIANTS.map((variant) => variant.fileName(version))
}

/**
 * The version a parsed latest-release pointer offers, or null when the pointer is not usable: every unusable shape
 * means the whole pointer is passed over, never a part of it (landing-page::REQ-002/AC-01).
 */
export function parsePointer(body: unknown): string | null {
  if (!isObject(body)) return null
  const { version, files } = body
  if (typeof version !== 'string' || !FORMAL_VERSION.test(version) || !Array.isArray(files)) return null
  const listed = new Set(files.map((file) => (isObject(file) ? file['name'] : undefined)))
  return fileNames(version).every((name) => listed.has(name)) ? version : null
}

interface Candidate {
  version: string
  published: number
  assets: unknown[]
}

/** A release the page could offer, or null for anything else: a draft, a pre-release, a tag not shaped `v` and `major.minor.patch`, an entry that is no release */
function candidate(entry: unknown): Candidate | null {
  if (!isObject(entry) || entry['draft'] !== false || entry['prerelease'] !== false) return null
  const tag = entry['tag_name']
  if (typeof tag !== 'string' || !tag.startsWith('v')) return null
  const version = tag.slice(1)
  // A tag with a suffix is a pre-release whatever its flag says
  if (!FORMAL_VERSION.test(version)) return null
  const published = typeof entry['published_at'] === 'string' ? Date.parse(entry['published_at']) : NaN
  if (Number.isNaN(published)) return null
  return { version, published, assets: Array.isArray(entry['assets']) ? entry['assets'] : [] }
}

/**
 * The version GitHub's releases list offers: that of the newest published formal release by publish date, when it has
 * all five files fully uploaded; otherwise null. An older release is not offered in place of an incomplete newest one
 * (landing-page::REQ-002/AC-02, landing-page failure A2).
 */
export function parseReleases(body: unknown): string | null {
  if (!Array.isArray(body)) return null
  let newest: Candidate | undefined
  for (const entry of body) {
    const release = candidate(entry)
    if (release && (!newest || release.published > newest.published)) newest = release
  }
  if (!newest) return null
  const uploaded = new Set(newest.assets.map((asset) => (isObject(asset) && asset['state'] === 'uploaded' ? asset['name'] : undefined)))
  return fileNames(newest.version).every((name) => uploaded.has(name)) ? newest.version : null
}

/**
 * The parsed JSON of an answer, or undefined when there is none to use: the request failed or was abandoned, the
 * status is not 200, or the body is not JSON. Only `signal` is passed to fetch: any other header than the ones a
 * browser always allows would make it send a CORS preflight, which the download host does not answer.
 */
async function readJson(fetch: Fetch, url: string, timeoutMs: number): Promise<unknown> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: abort.signal })
    if (response.status !== 200) return undefined
    return (await response.json()) as unknown
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** The version the latest-release pointer offers, or null when it cannot be read or is not usable (landing-page failure A1) */
export async function readPointer(fetch: Fetch, { timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<string | null> {
  return parsePointer(await readJson(fetch, LATEST_POINTER_URL, timeoutMs))
}

/** The version GitHub's releases list offers, or null when it cannot be read (rate limit, an error, no answer) or offers none (landing-page failure A2) */
export async function readGitHub(fetch: Fetch, { timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<string | null> {
  return parseReleases(await readJson(fetch, RELEASES_API_URL, timeoutMs))
}
