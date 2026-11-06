// The order of a received file's last steps (electron-security::REQ-001/AC-01): the complete partial file is quarantined
// while the final name still holds only its empty placeholder, so the file never appears under that name without it. And
// a transfer cancelled midway or arriving with the wrong hash leaves nothing under any name (the spec's failure modes, as
// before).
//
// Not driven: a rename that fails, which needs the receive folder to vanish during the transfer.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { receiveFileToDir } from './receive-file'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('receiving a file (electron-security::REQ-001)', () => {
  it('quarantines the complete partial file before it has its final name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'transfer-receive-order-'))
    const content = Buffer.from('a received file, complete')
    const seen: Array<{ path: string; partial: string; finalSize: number }> = []
    const result = await receiveFileToDir(Readable.from([content]), 'doc.txt', dir, undefined, undefined, 0, async (path) => {
      seen.push({ path, partial: readFileSync(path, 'utf8'), finalSize: statSync(join(dir, 'doc.txt')).size })
    })
    expect(seen).toHaveLength(1)
    expect(seen[0].path.endsWith('.part')).toBe(true)
    expect(seen[0].partial).toBe('a received file, complete')
    expect(seen[0].finalSize).toBe(0)
    expect(readFileSync(result.path, 'utf8')).toBe('a received file, complete')
  })

  it('leaves nothing behind when the sender stops midway', async () => {
    dir = mkdtempSync(join(tmpdir(), 'transfer-receive-order-'))
    // As a sender's cancel does: the request stream fails after part of the body, while the receive is reading it
    let reads = 0
    const stream = new Readable({
      read() {
        if (reads++ === 0) this.push(Buffer.from('the first part'))
        else this.destroy(new Error('aborted'))
      }
    })
    await expect(receiveFileToDir(stream, 'doc.txt', dir, undefined, undefined, 0, async () => {})).rejects.toThrow('aborted')
    expect(readdirSync(dir)).toEqual([])
  })

  it('leaves nothing behind when the content does not match the sender\'s hash', async () => {
    dir = mkdtempSync(join(tmpdir(), 'transfer-receive-order-'))
    const wrong = '0'.repeat(64)
    await expect(
      receiveFileToDir(Readable.from([Buffer.from('a received file')]), 'doc.txt', dir, wrong, undefined, 0, async () => {})
    ).rejects.toThrow('sha256 mismatch')
    expect(readdirSync(dir)).toEqual([])
  })
})
