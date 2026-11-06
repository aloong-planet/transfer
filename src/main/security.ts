// The decisions behind Transfer's Electron security baseline (docs/specs/electron-security.md, ADR-0025): pure functions,
// so that their bypass vectors can be unit tested. web-guards.ts feeds them Electron's URLs, IPC events and permissions.
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

/** What the check reads of an IPC event: the frame that sent it, `null` once that frame is gone (Electron's `senderFrame`) */
interface SenderEvent {
  senderFrame: { url: string; parent: unknown } | null
}

/**
 * Wraps an IPC handler so that it runs only for a call from a main frame on Transfer's own page
 * (electron-security::CON-003/AC-02): any other call is refused with an error before the handler runs.
 */
export function checkedListener<E extends SenderEvent, A extends unknown[], R>(
  channel: string,
  listener: (event: E, ...args: A) => R,
  devServerUrl?: string
): (event: E, ...args: A) => R {
  return (event, ...args) => {
    const frame = event.senderFrame
    const sender = frame ? { url: frame.url, isMainFrame: frame.parent === null } : null
    if (!isTrustedSender(sender, devServerUrl)) throw new Error(`Transfer refused an IPC call on ${channel}`)
    return listener(event, ...args)
  }
}
