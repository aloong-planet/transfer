import { describe, test, expect } from 'vitest'
import { TaskbarFlasher } from './taskbar-flasher'

// Gap: the real taskbar flash needs a Windows desktop, and the wiring from the renderer's
// unread total (`CMD.setUnread` in index.ts) to this class cannot be driven from a macOS dev
// machine. These cases cover the decision itself through the injected seams. That a state change
// of a message already shown, or a message sent from here, never raises the total is the count's
// rule and is covered by src/shared/unread.test.ts.

function setup(over: { platform?: string; focused?: boolean } = {}) {
  const state = { focused: over.focused ?? false, flashes: 0 }
  const flasher = new TaskbarFlasher({
    platform: over.platform ?? 'win32',
    windowFocused: () => state.focused,
    flashTaskbar: () => {
      state.flashes += 1
    }
  })
  return { state, flasher }
}

// unread::REQ-003/AC-02
describe('TaskbarFlasher', () => {
  test('flashes on Windows when the unread total rises while the window has no focus', () => {
    const { state, flasher } = setup()
    flasher.onUnreadTotal(1)
    expect(state.flashes).toBe(1)
  })

  // A state change of a message already shown leaves the total as it was; clearing a
  // conversation lowers it. Neither is a new incoming message.
  test.each([
    { name: 'the total is reported again unchanged', totals: [1, 1] },
    { name: 'the total falls', totals: [2, 1] }
  ])('does not flash again when $name', ({ totals }) => {
    const { state, flasher } = setup()
    flasher.onUnreadTotal(totals[0])
    expect(state.flashes).toBe(1)
    flasher.onUnreadTotal(totals[1])
    expect(state.flashes).toBe(1)
  })

  test('flashes for each further rise of the total', () => {
    const { state, flasher } = setup()
    flasher.onUnreadTotal(1)
    flasher.onUnreadTotal(2)
    expect(state.flashes).toBe(2)
  })

  test('does not flash while the window has focus', () => {
    const { state, flasher } = setup({ focused: true })
    flasher.onUnreadTotal(1)
    expect(state.flashes).toBe(0)
  })

  // On macOS a flash bounces the Dock icon without stopping (docs/postmortems/unread-react-pitfalls.md)
  test.each(['darwin', 'linux'])('never flashes on %s', (platform) => {
    const { state, flasher } = setup({ platform })
    flasher.onUnreadTotal(1)
    expect(state.flashes).toBe(0)
  })
})
