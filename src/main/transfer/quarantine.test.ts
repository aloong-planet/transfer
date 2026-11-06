// Received files are quarantined on macOS (electron-security::REQ-001, ADR-0025): the value and the step around the system
// tool. That a real received file carries the attribute is held by transfer.integration.test.ts on macOS.
import { describe, expect, it } from 'vitest'
import { quarantineReceivedFile, quarantineValue, runTool } from './quarantine'

const ID = 'F2E1D9C3-0000-4000-8000-000000000001'

describe('the quarantine value (electron-security::REQ-001/AC-01)', () => {
  it('has the form of a browser download, naming Transfer: flags, seconds in hex, agent, event id', () => {
    // 0x6a000000 seconds = 1778384896 s; the flags are those seen on downloaded files on macOS 26
    expect(quarantineValue(1_778_384_896_000, ID)).toBe(`0281;6a000000;Transfer;${ID}`)
  })

  it('drops the milliseconds rather than rounding them up', () => {
    expect(quarantineValue(1_778_384_896_999, ID)).toBe(`0281;6a000000;Transfer;${ID}`)
  })
})

describe('quarantining a received file (electron-security::REQ-001)', () => {
  it('writes the attribute with the system tool on macOS', async () => {
    const calls: Array<[string, string[]]> = []
    await quarantineReceivedFile('/r/a.part', {
      platform: 'darwin',
      run: async (file, args) => void calls.push([file, args]),
      now: () => 1_778_384_896_000,
      newId: () => ID.toLowerCase(),
      log: () => {}
    })
    expect(calls).toEqual([['/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0281;6a000000;Transfer;${ID}`, '/r/a.part']]])
  })

  it('keeps going when the attribute cannot be set, and says so in the log (AC-03)', async () => {
    const logged: string[] = []
    await expect(
      quarantineReceivedFile('/r/a.part', {
        platform: 'darwin',
        run: async () => {
          throw new Error('Operation not supported')
        },
        log: (line) => void logged.push(line)
      })
    ).resolves.toBeUndefined()
    expect(logged).toEqual(['[receive] could not quarantine /r/a.part: Operation not supported'])
  })

  it.each(['win32', 'linux'])('does nothing on other platforms (AC-04): %s', async (platform) => {
    let ran = false
    await quarantineReceivedFile('/r/a.part', { platform, run: async () => void (ran = true), log: () => {} })
    expect(ran).toBe(false)
  })
})

describe('the system tool is bounded in time (electron-security::REQ-001/AC-03)', () => {
  it('gives up on a tool that does not finish, so a stuck tool cannot hold up a transfer', async () => {
    const started = Date.now()
    await expect(runTool('/bin/sleep', ['5'], 200)).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
