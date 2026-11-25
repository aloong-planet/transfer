import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { MessageStatus } from '@shared/message'
import { canShowUnfinishedTextFile, writeTextFile } from './text-file'

// A full volume cannot be made portably in CI (it needs a mounted disk image or a quota), so the
// write is injected. Witnessed once by hand on a real 3 MB volume: writeFile threw ENOSPC after
// it had written 2.6 MB, and the part it had written stayed in the folder.
describe('writeTextFile', () => {
  test('a write that fails midway leaves no file in the folder and the error reaches the caller', async () => {
    const root = mkdtempSync(join(tmpdir(), 'transfer-textfile-'))
    try {
      const dir = join(root, 'sent-texts')
      const writeThenRunOutOfSpace = async (path: string, data: string): Promise<void> => {
        writeFileSync(path, data.slice(0, 10)) // the file exists and holds the first part
        throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
      }

      await expect(writeTextFile(dir, 'text', 'x'.repeat(100), writeThenRunOutOfSpace)).rejects.toMatchObject({
        code: 'ENOSPC'
      })
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// Real files in a real folder: the answer depends on what is on disk, so nothing here is faked.
describe('canShowUnfinishedTextFile', () => {
  let root: string
  let dir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'transfer-textfile-'))
    dir = join(root, 'sent-texts')
    mkdirSync(dir)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const made = (path: string): string => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, 'x')
    return path
  }
  const sentFile = (filePath: string | null, status: MessageStatus = 'failed'): Parameters<typeof canShowUnfinishedTextFile>[0] => ({
    type: 'file',
    direction: 'sent',
    status,
    filePath
  })

  test.each(['failed', 'rejected', 'expired'] as const)('a sent text file that ended %s is offered while the file is there', (status) => {
    expect(canShowUnfinishedTextFile(sentFile(made(join(dir, 'text_1_aaaaaaaa.txt')), status), dir)).toBe(true)
  })

  test.each(['pending', 'accepted', 'done', 'sent'] as const)('a sent text file that is %s is not offered here', (status) => {
    expect(canShowUnfinishedTextFile(sentFile(made(join(dir, 'text_1_aaaaaaaa.txt')), status), dir)).toBe(false)
  })

  test('is not offered once the file is gone', () => {
    expect(canShowUnfinishedTextFile(sentFile(join(dir, 'text_1_gone0000.txt')), dir)).toBe(false)
  })

  test.each([
    { name: 'a file elsewhere', path: (): string => join(root, 'doc.txt') },
    { name: 'a file in a folder whose name only starts like the folder', path: (): string => join(root, 'sent-texts-old', 'x.txt') },
    { name: 'a file in a folder below it', path: (): string => join(dir, 'sub', 'x.txt') },
    // written out by hand: join() would fold the ".." away
    { name: 'a path that climbs out of it', path: (): string => `${dir}${sep}..${sep}doc.txt` }
  ])('is not offered for $name, however much it exists', ({ path }) => {
    expect(canShowUnfinishedTextFile(sentFile(made(path())), dir)).toBe(false)
  })

  test('is not offered for a received message, a text message or a message without a path', () => {
    const own = made(join(dir, 'text_1_aaaaaaaa.txt'))
    expect(canShowUnfinishedTextFile({ ...sentFile(own), direction: 'recv' }, dir)).toBe(false)
    expect(canShowUnfinishedTextFile({ ...sentFile(own), type: 'text' }, dir)).toBe(false)
    expect(canShowUnfinishedTextFile(sentFile(null), dir)).toBe(false)
  })
})
