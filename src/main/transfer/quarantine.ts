// Received files are quarantined on macOS (electron-security::REQ-001, ADR-0025), as a browser download or AirDrop is, so
// opening a received app or script gets the system's first-launch check. Node has no extended-attribute API, so the
// system's xattr tool sets it.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'

/**
 * The `com.apple.quarantine` value: flags, the time in seconds as hex, the agent, an event id. The flags are those macOS 26
 * showed on files a browser downloaded (`0281;…;Chrome;…`); the agent names Transfer.
 */
export function quarantineValue(nowMs: number, eventId: string): string {
  return `0281;${Math.floor(nowMs / 1000).toString(16)};Transfer;${eventId.toUpperCase()}`
}

type Run = (file: string, args: string[]) => Promise<void>

const runTool: Run = (file, args) =>
  new Promise((resolve, reject) => execFile(file, args, (error) => (error ? reject(error) : resolve())))

/**
 * Sets the quarantine attribute on a received file on macOS; does nothing elsewhere. A failure (a volume that keeps no
 * extended attributes, for one) is logged and the file kept: the transfer itself has succeeded.
 */
export async function quarantineReceivedFile(
  path: string,
  {
    platform = process.platform as string,
    run = runTool,
    now = Date.now,
    newId = randomUUID as () => string,
    log = (line: string) => console.warn(line)
  }: { platform?: string; run?: Run; now?: () => number; newId?: () => string; log?: (line: string) => void } = {}
): Promise<void> {
  if (platform !== 'darwin') return
  try {
    await run('/usr/bin/xattr', ['-w', 'com.apple.quarantine', quarantineValue(now(), newId()), path])
  } catch (error) {
    log(`[receive] could not quarantine ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
