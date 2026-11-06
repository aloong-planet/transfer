// The decisions behind Transfer's Electron security baseline (docs/specs/electron-security.md, ADR-0025): pure functions,
// so that their bypass vectors can be unit tested. web-guards.ts and ipc.ts feed them Electron's URLs, frames and
// permissions.
import { APP_HOST } from './app-protocol'

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * Whether a URL is one of Transfer's own pages: `app://bundle` in a packaged build, the development server's origin in a
 * run from source. Compared after parsing, never by prefix, and a URL carrying a user name or password is never one:
 * Transfer's own URLs carry none.
 */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  const parsed = parse(url)
  if (!parsed || parsed.username !== '' || parsed.password !== '') return false
  if (devServerUrl !== undefined) {
    const dev = parse(devServerUrl)
    return dev !== null && parsed.origin === dev.origin
  }
  return parsed.protocol === 'app:' && parsed.host === APP_HOST
}

/** The one permission Transfer's pages use: the overlay copies a picked colour to the clipboard. Everything else is refused */
const GRANTED_PERMISSION = 'clipboard-sanitized-write'

export function permissionGranted(permission: string, requestingUrl: string, devServerUrl?: string): boolean {
  return permission === GRANTED_PERMISSION && isAppUrl(requestingUrl, devServerUrl)
}

/** Whether an IPC call may be answered: only from a main frame on Transfer's own page; Transfer has no subframes */
export function isTrustedSender(frame: { url: string; isMainFrame: boolean } | null, devServerUrl?: string): boolean {
  return frame !== null && frame.isMainFrame && isAppUrl(frame.url, devServerUrl)
}
