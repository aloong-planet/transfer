/**
 * Download configuration: the hosts the download links point at, and the five files of a release.
 *
 * The site keeps no version of its own. The version the download section shows is read when the page opens, from
 * the latest-release pointer or from GitHub's releases (landing-page::REQ-002), so a release needs no edit here.
 * Only the hosts, the path prefixes and the file names are fixed here: every link is built from them and a
 * validated version, never from the text of an answer (landing-page failure E1).
 */

// 两个下载来源的 base
const R2_BASE = 'https://dl.aloongplanet.com/releases' // Cloudflare R2 自定义域(主)
const GITHUB_REPO = 'https://github.com/aloong-planet/transfer' // GitHub Release(兜底)
const DOWNLOAD_STATS_PUBLIC_URL = 'https://dl.aloongplanet.com/stats/downloads.json'
const DOWNLOAD_STATS_DEV_PATH = '/__download-statistics'

export function getDownloadStatsUrl(isDev: boolean) {
  return isDev ? DOWNLOAD_STATS_DEV_PATH : DOWNLOAD_STATS_PUBLIC_URL
}

export const DOWNLOAD_STATS_URL = getDownloadStatsUrl(import.meta.env.DEV)

/** The latest-release pointer on the download host, written by the release workflow (build/gen-latest-json.cjs) */
export const LATEST_POINTER_URL = 'https://dl.aloongplanet.com/latest.json'

/** GitHub's public releases list for this repository: one request for the first hundred */
export const RELEASES_API_URL = 'https://api.github.com/repos/aloong-planet/transfer/releases?per_page=100'

/** What the download section leads to when no release can be read */
export const RELEASES_LATEST_URL = `${GITHUB_REPO}/releases/latest`

export interface Variant {
  /** Identifies the variant's row in the download section */
  id: string
  os: 'mac' | 'win'
  /** The i18n key of the variant's label */
  labelKey: string
  /** The file's name for a version, as the release build names it (electron-builder.yml `artifactName`) */
  fileName: (version: string) => string
}

/** The five files of a release, in the order the download section lists them */
export const VARIANTS: readonly Variant[] = [
  { id: 'mac-arm64', os: 'mac', labelKey: 'download.mac.arm64', fileName: (version) => `Transfer-${version}-mac-arm64.dmg` },
  { id: 'mac-x64', os: 'mac', labelKey: 'download.mac.x64', fileName: (version) => `Transfer-${version}-mac-x64.dmg` },
  { id: 'mac-universal', os: 'mac', labelKey: 'download.mac.universal', fileName: (version) => `Transfer-${version}-mac-universal.dmg` },
  { id: 'win-setup', os: 'win', labelKey: 'download.win.setup', fileName: (version) => `Transfer-${version}-win-setup.exe` },
  { id: 'win-portable', os: 'win', labelKey: 'download.win.portable', fileName: (version) => `Transfer-${version}-win-portable.exe` },
]

/** 给定文件名，拼出两处来源的下载 URL */
export function sources(filename: string, version: string) {
  return {
    // 主:R2 自定义域,按版本目录
    r2: `${R2_BASE}/v${version}/${filename}`,
    // 兜底:GitHub Release 附件
    github: `${GITHUB_REPO}/releases/download/v${version}/${filename}`,
  }
}
