// A text over the send limit, written to a .txt file (sender side, see ChatService.sendText).
//
// Electron-free: the folder and the file-name prefix are passed in by the caller (the
// prefix follows the interface language and is resolved in main/index.ts).

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Writes `text` as UTF-8 to a new file under `dir` and returns the file's path.
 * The name is `<prefix>_<time stamp>_<8 random hex>.txt`, built like a pasted image's: two
 * texts sent within the same millisecond do not collide. The file is not deleted after the
 * send, because the `filePath` of the sent file message has to keep pointing at this copy.
 */
export async function writeTextFile(dir: string, prefix: string, text: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}.txt`)
  await writeFile(path, text, 'utf8')
  return path
}
