// A text over the send limit, written to a .txt file (sender side, see ChatService.sendText).
//
// Electron-free: the folder and the file-name prefix are passed in by the caller (the
// prefix follows the interface language and is resolved in main/index.ts).

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { Message, MessageStatus } from '@shared/message'

/**
 * Writes `text` as UTF-8 to a new file under `dir` and returns the file's path.
 * The name is `<prefix>_<time stamp>_<8 random hex>.txt`, built like a pasted image's: two
 * texts sent within the same millisecond do not collide. The file is not deleted after the
 * send: the `filePath` of the sent file message has to keep pointing at this copy, and when
 * the send does not arrive it is the only place the text still exists.
 */
export async function writeTextFile(
  dir: string,
  prefix: string,
  text: string,
  write: (path: string, data: string) => Promise<void> = (p, d) => writeFile(p, d, 'utf8')
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}.txt`)
  try {
    await write(path, text)
  } catch (e) {
    // A write that fails midway (a full volume) leaves the part it wrote. Nothing points at that
    // file and it is the one thing we can free on a volume that is already full, so remove it
    // (the pasted image's copy is removed on failure the same way). The caller gets the
    // original error, whether or not the removal worked.
    await rm(path, { force: true }).catch(() => undefined)
    throw e
  }
  return path
}

/** The statuses in which a sent file ended without arriving. */
const ENDED_UNDELIVERED: Record<MessageStatus, boolean> = {
  pending: false,
  accepted: false,
  sent: false,
  done: false,
  failed: true,
  rejected: true,
  expired: true
}

/**
 * Whether the conversation offers "Show in Folder" for a sent message that ended without
 * arriving because it is a text sent as a file: this copy in `dir` is then the only place the
 * text still exists, and the user can open it or drag it back into the chat. A delivered message
 * has the button by the ordinary rule, and an ordinary file or image that did not arrive has none
 * (the user still has the original), so only a message whose file sits directly in `dir` and
 * is still there answers true. `dir` is where `writeTextFile` was told to write.
 */
export function canShowUnfinishedTextFile(
  msg: Pick<Message, 'type' | 'direction' | 'status' | 'filePath'>,
  dir: string
): boolean {
  if (msg.type !== 'file' || msg.direction !== 'sent' || !msg.filePath) return false
  // `=== true`: a status written by a newer version is outside the union and looks up as undefined
  if (ENDED_UNDELIVERED[msg.status] !== true) return false
  // The folder is compared as a path, not as a text prefix: "sent-texts-old" or a ".." in the path must not count
  if (relative(dir, dirname(msg.filePath)) !== '') return false
  return existsSync(msg.filePath)
}
